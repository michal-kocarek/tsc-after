import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { resolveCleanupRoots } from "../cleanup.ts";
import {
	applyCopy,
	type CopyEntry,
	parseCopyEntry,
	planCopy as planCopyWithRoots,
} from "../copy.ts";
import { realpath } from "../paths.ts";

describe(parseCopyEntry, () => {
	it("splits at the last colon", ({ expect }) => {
		expect(parseCopyEntry("src:file.json:assets/file.json")).toStrictEqual({
			destination: "assets/file.json",
			source: "src:file.json",
		});
	});

	it("preserves a Windows drive letter", ({ expect }) => {
		expect(parseCopyEntry("C:\\schema.json:schemas/schema.json")).toStrictEqual(
			{
				destination: "schemas/schema.json",
				source: "C:\\schema.json",
			},
		);
	});

	it("returns undefined when the separator is missing", ({ expect }) => {
		expect(parseCopyEntry("src/file.json")).toBeUndefined();
	});

	it("returns undefined when the source is empty", ({ expect }) => {
		expect(parseCopyEntry(":file.json")).toBeUndefined();
	});

	it("returns undefined when the destination is empty", ({ expect }) => {
		expect(parseCopyEntry("src/file.json:")).toBeUndefined();
	});
});

describe(planCopyWithRoots, () => {
	it("refuses an absolute destination", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir);

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", path.join(projectDir, "schema.json"))],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("destination must be relative to outDir");
		expect(fs.existsSync(sourcePath)).toBe(true);
	});

	it("refuses a destination containing a parent segment", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "../schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("destination must not contain '..'");
	});

	it("refuses the outDir itself as a destination", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", ".")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("it resolves to outDir");
	});

	it("refuses a destination ending in a directory separator", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "assets/")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("destination must be a file path");
	});

	it("refuses missing source files", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const missingSourcePath = path.join(projectDir, "missing.json");

		expect(() =>
			planCopy(
				[copyEntry(missingSourcePath, "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("Refusing to copy 'missing.json': it does not exist.");
	});

	it("refuses source paths that are not regular files", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		fs.mkdirSync(path.join(projectDir, "src"));

		expect(() =>
			planCopy(
				[copyEntry("src", "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("Refusing to copy 'src': it is not a regular file.");
	});

	it("refuses symbolic-link sources", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const targetPath = createSource(projectDir);
		const linkPath = path.join(projectDir, "src/linked.json");
		fs.symlinkSync(targetPath, linkPath);

		expect(() =>
			planCopy(
				[copyEntry("src/linked.json", "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("Refusing to copy 'src/linked.json': it is a symbolic link.");
	});

	it("refuses sources outside the current working directory", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outsideDir = createTempDir(onTestFinished);
		const outsidePath = path.join(outsideDir, "outside.json");
		fs.writeFileSync(outsidePath, "outside");

		expect(() =>
			planCopy(
				[copyEntry(outsidePath, "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("it is outside the current working directory");
	});

	it("refuses a source whose real path is outside the current working directory", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outsideDir = createTempDir(onTestFinished);
		const outsidePath = path.join(outsideDir, "outside.json");
		const linkPath = path.join(projectDir, "linked");
		fs.writeFileSync(outsidePath, "outside");
		fs.symlinkSync(outsideDir, linkPath, "dir");

		expect(() =>
			planCopy(
				[copyEntry("linked/outside.json", "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("its real path is outside the current working directory");
	});

	it("refuses a source inside outDir", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir, "dist/schema.json");

		expect(() =>
			planCopy(
				[copyEntry("dist/schema.json", "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow(
			`Refusing to copy 'dist/schema.json': it is inside outDir 'dist'.`,
		);
		expect(fs.existsSync(sourcePath)).toBe(true);
	});

	it("refuses a source inside declarationDir", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir, "types/schema.d.ts");

		expect(() =>
			planCopy(
				[copyEntry("types/schema.d.ts", "schema.d.ts")],
				createProject(projectDir, { declarationDir: "types" }),
				projectDir,
			),
		).toThrow(
			`Refusing to copy 'types/schema.d.ts': it is inside declarationDir 'types'.`,
		);
	});

	it("refuses destinations shared by copy entries", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);

		expect(() =>
			planCopy(
				[
					copyEntry("src/schema.json", "schema.json"),
					copyEntry("src/schema.json", "schema.json"),
				],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("is shared with another copy entry");
	});

	it("allows case-only destination differences on case-sensitive paths", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);
		const entries = [
			copyEntry("src/schema.json", "schema.json"),
			copyEntry("src/schema.json", "SCHEMA.json"),
		];

		expect(
			planCopy(
				entries,
				createProject(projectDir, { useCaseSensitiveFileNames: true }),
				projectDir,
			),
		).toHaveLength(2);
	});

	it("refuses case-only destination differences on case-insensitive paths", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);

		expect(() =>
			planCopy(
				[
					copyEntry("src/schema.json", "schema.json"),
					copyEntry("src/schema.json", "SCHEMA.json"),
				],
				createProject(projectDir, { useCaseSensitiveFileNames: false }),
				projectDir,
			),
		).toThrow("is shared with another copy entry");
	});

	it("refuses destinations nested under another destination", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);

		expect(() =>
			planCopy(
				[
					copyEntry("src/schema.json", "assets"),
					copyEntry("src/schema.json", "assets/schema.json"),
				],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("is nested with another copy destination");
	});

	it("refuses destinations that overlap project outputs", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);
		const outputPath = path.join(projectDir, "dist/schema.json");

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "schema.json")],
				createProject(projectDir, { outputPaths: [outputPath] }),
				projectDir,
			),
		).toThrow("it is an output of the project");
	});

	it("refuses destinations whose parent path passes through an output", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "assets/schema.json")],
				createProject(projectDir, {
					outputPaths: [path.join(projectDir, "dist/assets")],
				}),
				projectDir,
			),
		).toThrow("overlaps an output of the project");
	});

	it("refuses existing destination directories", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);
		fs.mkdirSync(path.join(projectDir, "dist/assets"), { recursive: true });

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "assets")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("it is not a regular file");
	});

	it("refuses an existing symbolic-link destination", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir);
		const linkedPath = path.join(projectDir, "dist/linked.json");
		fs.mkdirSync(path.dirname(linkedPath), { recursive: true });
		fs.symlinkSync(sourcePath, linkedPath);

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "linked.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow("it is a symbolic link");
	});

	it("refuses symbolic-link path components below outDir", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir);
		const targetDir = createTempDir(onTestFinished);
		const linkedDir = path.join(projectDir, "dist/assets");
		fs.mkdirSync(path.dirname(linkedDir), { recursive: true });
		fs.symlinkSync(targetDir, linkedDir, "dir");

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "assets/schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow(
			`path component '${path.join("dist", "assets")}' is a symbolic link`,
		);
		expect(fs.existsSync(sourcePath)).toBe(true);
	});

	it("refuses non-directory path components below outDir", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);
		const componentPath = path.join(projectDir, "dist/assets");
		fs.mkdirSync(path.dirname(componentPath), { recursive: true });
		fs.writeFileSync(componentPath, "not a directory");

		expect(() =>
			planCopy(
				[copyEntry("src/schema.json", "assets/schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toThrow(
			`path component '${path.join("dist", "assets")}' is not a directory`,
		);
	});

	it("skips a destination with identical bytes", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir, "src/schema.json", "schema");
		const destinationPath = path.join(projectDir, "dist/schema.json");
		fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
		fs.writeFileSync(destinationPath, "schema");

		expect(
			planCopy(
				[copyEntry("src/schema.json", "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toStrictEqual([
			{
				destinationPath,
				reason: "up to date",
				sourcePath,
				type: "skipped",
			},
		]);
	});

	it("plans a copy when destination bytes differ", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir);
		const destinationPath = path.join(projectDir, "dist/schema.json");
		fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
		fs.writeFileSync(destinationPath, "old schema");

		expect(
			planCopy(
				[copyEntry("src/schema.json", "schema.json")],
				createProject(projectDir),
				projectDir,
			),
		).toStrictEqual([{ destinationPath, sourcePath, type: "copyFile" }]);
	});
});

describe(applyCopy, () => {
	it("creates parent directories and copies planned files", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir);
		const destinationPath = path.join(projectDir, "dist/assets/schema.json");
		const plan = planCopy(
			[copyEntry("src/schema.json", "assets/schema.json")],
			createProject(projectDir),
			projectDir,
		);

		applyCopy(plan, { dry: false });

		expect(fs.readFileSync(destinationPath, "utf8")).toBe(
			fs.readFileSync(sourcePath, "utf8"),
		);
	});

	it("overwrites an existing regular file", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = createSource(projectDir);
		const destinationPath = path.join(projectDir, "dist/schema.json");
		fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
		fs.writeFileSync(destinationPath, "old schema");
		const plan = planCopy(
			[copyEntry("src/schema.json", "schema.json")],
			createProject(projectDir),
			projectDir,
		);

		applyCopy(plan, { dry: false });

		expect(fs.readFileSync(destinationPath, "utf8")).toBe(
			fs.readFileSync(sourcePath, "utf8"),
		);
	});

	it("writes nothing in a dry run", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		createSource(projectDir);
		const plan = planCopy(
			[copyEntry("src/schema.json", "assets/schema.json")],
			createProject(projectDir),
			projectDir,
		);

		applyCopy(plan, { dry: true });

		expect(fs.existsSync(path.join(projectDir, "dist/assets"))).toBe(false);
	});
});

function copyEntry(source: string, destination: string): CopyEntry {
	return { destination, source };
}

function createProject(
	projectDir: string,
	{
		declarationDir,
		outDir = "dist",
		outputPaths = [],
		useCaseSensitiveFileNames = true,
	}: {
		declarationDir?: string;
		outDir?: string;
		outputPaths?: string[];
		useCaseSensitiveFileNames?: boolean;
	} = {},
): Parameters<typeof planCopyWithRoots>[1] {
	return {
		declarationDir:
			declarationDir === undefined
				? undefined
				: path.resolve(projectDir, declarationDir),
		outDir: path.resolve(projectDir, outDir),
		outputPaths: new Set(outputPaths),
		useCaseSensitiveFileNames,
	};
}

function createSource(
	projectDir: string,
	relativePath = "src/schema.json",
	content = "schema",
): string {
	const sourcePath = path.join(projectDir, relativePath);
	fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
	fs.writeFileSync(sourcePath, content);
	return sourcePath;
}

function createTempDir(onTestFinished: (cleanup: () => void) => void): string {
	const projectDir = realpath(
		fs.mkdtempSync(path.join(os.tmpdir(), "tsc-after-copy-")),
	);
	onTestFinished(() => {
		fs.rmSync(projectDir, { force: true, recursive: true });
	});
	return projectDir;
}

function planCopy(
	entries: readonly CopyEntry[],
	project: Parameters<typeof planCopyWithRoots>[1],
	cwd: string,
) {
	const roots = resolveCleanupRoots({ ...project, sourceFileNames: [] }, cwd);
	return planCopyWithRoots(entries, project, roots, cwd);
}
