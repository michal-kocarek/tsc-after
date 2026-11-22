import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, vi } from "vitest";

import { applyCleanup, planCleanup } from "../cleanup.ts";
import { UserError } from "../errors.ts";
import { realpath } from "../paths.ts";

describe(planCleanup, () => {
	it("refuses roots outside cwd or containing cwd", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);

		expect(() =>
			planCleanup(
				createProject(projectDir, { outDir: "../outside" }),
				projectDir,
				[],
			),
		).toThrow(UserError);
		expect(() =>
			planCleanup(createProject(projectDir, { outDir: "." }), projectDir, []),
		).toThrow(UserError);
	});

	it("refuses a root that contains a source file", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = path.join(projectDir, "dist/index.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export {};");

		expect(() =>
			planCleanup(
				createProject(
					projectDir,
					{ outDir: "dist" },
					{ sourceFileNames: [sourcePath] },
				),
				projectDir,
				[],
			),
		).toThrow(`contains source file '${path.join("dist", "index.ts")}'`);
	});

	it("refuses a source whose real path is inside the root", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outDir = path.join(projectDir, "dist");
		const sourcePath = path.join(projectDir, "src/index.ts");
		fs.mkdirSync(outDir);
		fs.mkdirSync(path.dirname(sourcePath));
		fs.writeFileSync(path.join(outDir, "index.ts"), "export {};");
		fs.symlinkSync(path.join(outDir, "index.ts"), sourcePath);

		expect(() =>
			planCleanup(
				createProject(
					projectDir,
					{ outDir: "dist" },
					{ sourceFileNames: [sourcePath] },
				),
				projectDir,
				[],
			),
		).toThrow(`contains source file '${path.join("src", "index.ts")}'`);
	});

	it("uses the lexical path when a source cannot be resolved", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = path.join(projectDir, "dist/missing.ts");

		expect(() =>
			planCleanup(
				createProject(
					projectDir,
					{ outDir: "dist" },
					{ sourceFileNames: [sourcePath] },
				),
				projectDir,
				[],
			),
		).toThrow(`contains source file '${path.join("dist", "missing.ts")}'`);
	});

	it("refuses a root reached through a symbolic link", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const targetDir = createTempDir(onTestFinished);
		fs.symlinkSync(targetDir, path.join(projectDir, "linked"), "dir");

		expect(() =>
			planCleanup(
				createProject(projectDir, { outDir: "linked" }),
				projectDir,
				[],
			),
		).toThrow("Refusing to clean outDir through a symbolic link: linked!");
	});

	it("refuses a missing root under a symbolic link", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const targetDir = createTempDir(onTestFinished);
		fs.symlinkSync(targetDir, path.join(projectDir, "linked"), "dir");

		expect(() =>
			planCleanup(
				createProject(projectDir, { outDir: "linked/dist" }),
				projectDir,
				[],
			),
		).toThrow(
			`Refusing to clean outDir through a symbolic link: ${path.join("linked", "dist")}!`,
		);
	});

	it("refuses a dangling root symbolic link", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		fs.symlinkSync("missing", path.join(projectDir, "dist"));

		expect(() =>
			planCleanup(
				createProject(projectDir, { outDir: "dist" }),
				projectDir,
				[],
			),
		).toThrow("Refusing to clean outDir through a symbolic link: dist!");
	});

	it("refuses a non-directory parent component", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		fs.writeFileSync(path.join(projectDir, "file"), "not a directory");

		expect(() =>
			planCleanup(
				createProject(projectDir, { outDir: "file/dist" }),
				projectDir,
				[],
			),
		).toThrow(
			`Refusing to clean outDir '${path.join("file", "dist")}': 'file' is not a directory.`,
		);
	});

	it("plans nothing for a missing root", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);

		expect(
			planCleanup(
				createProject(projectDir, { outDir: "dist" }),
				projectDir,
				[],
			),
		).toStrictEqual([{ root: outDirRoot(projectDir, "dist"), verdicts: [] }]);
	});

	it("marks stale files and empty directories for removal", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outDir = path.join(projectDir, "dist");
		const emptyDirPath = path.join(outDir, "empty");
		const staleFilePath = path.join(outDir, "stale.js");
		fs.mkdirSync(emptyDirPath, { recursive: true });
		fs.writeFileSync(staleFilePath, "stale");

		expect(
			planCleanup(
				createProject(projectDir, { outDir: "dist" }),
				projectDir,
				[],
			),
		).toStrictEqual([
			{
				root: outDirRoot(projectDir, "dist"),
				verdicts: [
					{ path: emptyDirPath, type: "removeDir" },
					{ path: staleFilePath, type: "removeFile" },
					{ path: outDir, type: "removeDir" },
				],
			},
		]);
	});

	it("keeps outputs and symbolic links as skipped entries", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outDir = path.join(projectDir, "dist");
		const outputPath = path.join(outDir, "current.js");
		const linkPath = path.join(outDir, "linked");
		fs.mkdirSync(outDir);
		fs.writeFileSync(outputPath, "current");
		fs.symlinkSync(outputPath, linkPath);

		expect(
			planVerdicts(
				createProject(
					projectDir,
					{ outDir: "dist" },
					{ outputPaths: [outputPath] },
				),
				projectDir,
			),
		).toStrictEqual([
			{ path: outputPath, reason: "expected output file", type: "skipped" },
			{ path: linkPath, reason: "symbolic link", type: "skipped" },
			{ path: outDir, reason: "directory not empty", type: "skipped" },
		]);
	});

	it("keeps copy destinations as expected output files", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outDir = path.join(projectDir, "dist");
		const assetsDir = path.join(outDir, "assets");
		const destinationPath = path.join(assetsDir, "schema.json");
		fs.mkdirSync(assetsDir, { recursive: true });
		fs.writeFileSync(destinationPath, "schema");

		expect(
			planCleanup(createProject(projectDir, { outDir: "dist" }), projectDir, [
				destinationPath,
			]),
		).toStrictEqual([
			{
				root: outDirRoot(projectDir, "dist"),
				verdicts: [
					{
						path: destinationPath,
						reason: "expected output file",
						type: "skipped",
					},
					{
						path: assetsDir,
						reason: "copy destination directory",
						type: "skipped",
					},
					{
						path: outDir,
						reason: "copy destination directory",
						type: "skipped",
					},
				],
			},
		]);
	});

	it("keeps empty directories that will contain copy destinations", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outDir = path.join(projectDir, "dist");
		const assetsDir = path.join(outDir, "assets");
		const nestedDir = path.join(assetsDir, "nested");
		const destinationPath = path.join(nestedDir, "schema.json");
		fs.mkdirSync(nestedDir, { recursive: true });

		expect(
			planCleanup(createProject(projectDir, { outDir: "dist" }), projectDir, [
				destinationPath,
			]),
		).toStrictEqual([
			{
				root: outDirRoot(projectDir, "dist"),
				verdicts: [
					{
						path: nestedDir,
						reason: "copy destination directory",
						type: "skipped",
					},
					{
						path: assetsDir,
						reason: "copy destination directory",
						type: "skipped",
					},
					{
						path: outDir,
						reason: "copy destination directory",
						type: "skipped",
					},
				],
			},
		]);
	});

	it("normalizes output separators before comparing paths", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outputPath = path.join(projectDir, "dist/current.js");
		fs.mkdirSync(path.dirname(outputPath));
		fs.writeFileSync(outputPath, "current");

		expect(
			planVerdicts(
				createProject(
					projectDir,
					{ outDir: "dist" },
					{ outputPaths: [outputPath.replaceAll("\\", "/")] },
				),
				projectDir,
			),
		).toContainEqual({
			path: outputPath,
			reason: "expected output file",
			type: "skipped",
		});
	});

	it("compares output paths case-insensitively when requested", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outputPath = path.join(projectDir, "dist/current.js");
		fs.mkdirSync(path.dirname(outputPath));
		fs.writeFileSync(outputPath, "current");

		expect(
			planVerdicts(
				createProject(
					projectDir,
					{ outDir: "dist" },
					{
						outputPaths: [path.join(projectDir, "dist/CURRENT.js")],
						useCaseSensitiveFileNames: false,
					},
				),
				projectDir,
			),
		).toContainEqual({
			path: outputPath,
			reason: "expected output file",
			type: "skipped",
		});
	});

	it("accepts a cleanup root on another device", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const rootPath = path.join(projectDir, "dist");
		fs.mkdirSync(rootPath);
		using lstatSync = spyOnDevice(rootPath);

		expect(
			planCleanup(
				createProject(projectDir, { outDir: "dist" }),
				projectDir,
				[],
			),
		).toStrictEqual([
			{
				root: outDirRoot(projectDir, "dist"),
				verdicts: [{ path: rootPath, type: "removeDir" }],
			},
		]);
		expect(lstatSync).toHaveBeenCalledWith(rootPath);
	});

	it("skips a child folder on another device", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const mountedDirPath = path.join(projectDir, "dist/mounted");
		const nestedFilePath = path.join(mountedDirPath, "host-file.js");
		fs.mkdirSync(mountedDirPath, { recursive: true });
		fs.writeFileSync(nestedFilePath, "keep");
		using lstatSync = spyOnDevice(mountedDirPath);

		const verdicts = planVerdicts(
			createProject(projectDir, { outDir: "dist" }),
			projectDir,
		);

		expect(lstatSync).toHaveBeenCalledWith(mountedDirPath);
		expect(verdicts).toContainEqual({
			path: mountedDirPath,
			reason: "different device",
			type: "skipped",
		});
		expect(verdicts).not.toContainEqual(
			expect.objectContaining({ path: nestedFilePath }),
		);
	});

	it("drops declarationDir when it is inside outDir", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const staleTypesPath = path.join(projectDir, "dist/types/stale.d.ts");
		fs.mkdirSync(path.dirname(staleTypesPath), { recursive: true });
		fs.writeFileSync(staleTypesPath, "stale");

		const plan = planCleanup(
			createProject(projectDir, {
				declarationDir: "dist/types",
				outDir: "dist",
			}),
			projectDir,
			[],
		);

		expect(plan.map(({ root }) => root)).toStrictEqual([
			outDirRoot(projectDir, "dist"),
		]);
		expect(plan[0]?.verdicts).toContainEqual({
			path: staleTypesPath,
			type: "removeFile",
		});
	});

	it("leaves outDir to its own root when it is inside declarationDir", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const declarationDir = path.join(projectDir, "dist");
		const outDir = path.join(declarationDir, "js");
		const outputPath = path.join(outDir, "index.js");
		const staleOutputPath = path.join(outDir, "stale.js");
		const staleTypesPath = path.join(declarationDir, "stale.d.ts");
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(outputPath, "current");
		fs.writeFileSync(staleOutputPath, "stale");
		fs.writeFileSync(staleTypesPath, "stale");

		expect(
			planCleanup(
				createProject(
					projectDir,
					{ declarationDir: "dist", outDir: "dist/js" },
					{ outputPaths: [outputPath] },
				),
				projectDir,
				[],
			),
		).toStrictEqual([
			{
				root: outDirRoot(projectDir, path.join("dist", "js")),
				verdicts: [
					{ path: outputPath, reason: "expected output file", type: "skipped" },
					{ path: staleOutputPath, type: "removeFile" },
					{ path: outDir, reason: "directory not empty", type: "skipped" },
				],
			},
			{
				root: {
					name: "declarationDir",
					path: declarationDir,
					relativePath: "dist",
				},
				verdicts: [
					{ path: staleTypesPath, type: "removeFile" },
					{
						path: declarationDir,
						reason: "directory not empty",
						type: "skipped",
					},
				],
			},
		]);
	});

	it("removes declarationDir when its nested outDir is removed", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const declarationDir = path.join(projectDir, "dist");
		const outDir = path.join(declarationDir, "js");
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(path.join(outDir, "stale.js"), "stale");

		const plan = planCleanup(
			createProject(projectDir, { declarationDir: "dist", outDir: "dist/js" }),
			projectDir,
			[],
		);

		expect(plan[1]?.verdicts).toStrictEqual([
			{ path: declarationDir, type: "removeDir" },
		]);
	});
});

describe(applyCleanup, () => {
	it("removes stale files and then their directories", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const declarationDir = path.join(projectDir, "dist");
		const outDir = path.join(declarationDir, "js");
		fs.mkdirSync(path.join(outDir, "nested"), { recursive: true });
		fs.writeFileSync(path.join(outDir, "nested/stale.js"), "stale");
		fs.writeFileSync(path.join(declarationDir, "stale.d.ts"), "stale");
		const plan = planCleanup(
			createProject(projectDir, { declarationDir: "dist", outDir: "dist/js" }),
			projectDir,
			[],
		);

		expect(applyCleanup(plan, { dry: false })).toStrictEqual(plan);
		expect(fs.existsSync(declarationDir)).toBe(false);
	});

	it("removes a previous copy destination once it is no longer requested", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const destinationPath = path.join(projectDir, "dist/schema.json");
		fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
		fs.writeFileSync(destinationPath, "old schema");
		const plan = planCleanup(
			createProject(projectDir, { outDir: "dist" }),
			projectDir,
			[],
		);

		expect(applyCleanup(plan, { dry: false })).toStrictEqual(plan);
		expect(fs.existsSync(destinationPath)).toBe(false);
	});

	it("changes nothing in a dry run", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const staleFilePath = path.join(projectDir, "dist/stale.js");
		fs.mkdirSync(path.dirname(staleFilePath));
		fs.writeFileSync(staleFilePath, "stale");
		const plan = planCleanup(
			createProject(projectDir, { outDir: "dist" }),
			projectDir,
			[],
		);

		expect(applyCleanup(plan, { dry: true })).toStrictEqual(plan);
		expect(fs.existsSync(staleFilePath)).toBe(true);
	});

	it("keeps a busy cleanup root after removing its stale files", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const rootPath = path.join(projectDir, "dist");
		const staleFilePath = path.join(rootPath, "stale.js");
		fs.mkdirSync(rootPath);
		fs.writeFileSync(staleFilePath, "stale");
		const plan = planCleanup(
			createProject(projectDir, { outDir: "dist" }),
			projectDir,
			[],
		);
		const originalRmdirSync = fs.rmdirSync;
		using rmdir = vi
			.spyOn(fs, "rmdirSync")
			.mockImplementation((dirPath: fs.PathLike) => {
				if (dirPath === rootPath) {
					throw Object.assign(new Error("device or resource busy"), {
						code: "EBUSY",
					});
				}
				originalRmdirSync(dirPath);
			});

		expect(applyCleanup(plan, { dry: false })).toStrictEqual([
			{
				root: outDirRoot(projectDir, "dist"),
				verdicts: [
					{ path: staleFilePath, type: "removeFile" },
					{ path: rootPath, reason: "busy directory", type: "skipped" },
				],
			},
		]);
		expect(rmdir).toHaveBeenCalledWith(rootPath);
		expect(fs.existsSync(staleFilePath)).toBe(false);
		expect(fs.existsSync(rootPath)).toBe(true);
	});
});

function createProject(
	projectDir: string,
	dirs: { declarationDir?: string; outDir: string },
	{
		outputPaths = [],
		sourceFileNames = [],
		useCaseSensitiveFileNames = true,
	}: {
		outputPaths?: string[];
		sourceFileNames?: string[];
		useCaseSensitiveFileNames?: boolean;
	} = {},
): Parameters<typeof planCleanup>[0] {
	return {
		declarationDir:
			dirs.declarationDir === undefined
				? undefined
				: path.resolve(projectDir, dirs.declarationDir),
		outDir: path.resolve(projectDir, dirs.outDir),
		outputPaths: new Set(outputPaths),
		sourceFileNames,
		useCaseSensitiveFileNames,
	};
}

function createTempDir(onTestFinished: (cleanup: () => void) => void): string {
	const projectDir = realpath(
		fs.mkdtempSync(path.join(os.tmpdir(), "tsc-after-")),
	);
	onTestFinished(() => {
		fs.rmSync(projectDir, { force: true, recursive: true });
	});
	return projectDir;
}

function outDirRoot(projectDir: string, relativePath: string) {
	return {
		name: "outDir",
		path: path.join(projectDir, relativePath),
		relativePath,
	};
}

function planVerdicts(
	project: Parameters<typeof planCleanup>[0],
	cwd: string,
): unknown[] {
	return planCleanup(project, cwd, []).flatMap(({ verdicts }) => verdicts);
}

function spyOnDevice(dirPath: string) {
	const originalLstatSync = fs.lstatSync;
	return vi.spyOn(fs, "lstatSync").mockImplementation((filePath) => {
		const stats = originalLstatSync(filePath);
		if (path.resolve(String(filePath)) === dirPath) {
			Object.defineProperty(stats, "dev", { value: stats.dev + 1 });
		}
		return stats;
	});
}
