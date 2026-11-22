import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { UserError } from "../errors.ts";
import { realpath } from "../paths.ts";
import { loadProject } from "../project.ts";

const SOURCE_FILES = { "src/index.ts": "export const value = 1;" };

describe(loadProject, () => {
	it("loads source files and outDir from an extended config", async ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempProject(onTestFinished, {
			"base.json": JSON.stringify({
				compilerOptions: { outDir: "dist", rootDir: "." },
			}),
			"lib/imported.ts": "export const imported = true;",
			"src/index.ts": 'import "../lib/imported";\nexport const value = 1;',
			"tsconfig.json": JSON.stringify({
				extends: "./base.json",
				include: ["src"],
			}),
		});

		const project = await loadProject(".", projectDir);

		expect({
			...project,
			outputPaths: normalizePaths(project.outputPaths),
			sourceFileNames: normalizePaths(project.sourceFileNames),
		}).toStrictEqual({
			configFilePath: path.join(projectDir, "tsconfig.json"),
			declarationDir: undefined,
			outDir: path.join(projectDir, "dist"),
			outputPaths: new Set([
				path.join(projectDir, "dist/lib/imported.js"),
				path.join(projectDir, "dist/src/index.js"),
			]),
			sourceFileNames: new Set([
				path.join(projectDir, "lib/imported.ts"),
				path.join(projectDir, "src/index.ts"),
			]),
			useCaseSensitiveFileNames: !fs.existsSync(
				path.join(projectDir, "TSCONFIG.JSON"),
			),
		});
	});

	it("returns JavaScript, declaration, and map output paths", async ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempProject(onTestFinished, {
			...SOURCE_FILES,
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					declaration: true,
					declarationDir: "types",
					declarationMap: true,
					outDir: "dist",
					rootDir: "src",
					sourceMap: true,
				},
			}),
		});

		const project = await loadProject("tsconfig.json", projectDir);

		expect(project.declarationDir).toBe(path.join(projectDir, "types"));
		expect(normalizePaths(project.outputPaths)).toStrictEqual(
			new Set([
				path.join(projectDir, "dist/index.js"),
				path.join(projectDir, "dist/index.js.map"),
				path.join(projectDir, "types/index.d.ts"),
				path.join(projectDir, "types/index.d.ts.map"),
			]),
		);
	});

	it.for([
		{
			compilerOptions: { incremental: true },
			name: "the build-info file for incremental",
			outputPaths: ["dist/src/index.js", "dist/tsconfig.tsbuildinfo"],
		},
		{
			compilerOptions: { composite: true },
			name: "the build-info file for composite",
			outputPaths: [
				"dist/src/index.js",
				"dist/src/index.d.ts",
				"dist/tsconfig.tsbuildinfo",
			],
		},
		{
			compilerOptions: {
				incremental: true,
				tsBuildInfoFile: "dist/build.json",
			},
			name: "tsBuildInfoFile",
			outputPaths: ["dist/src/index.js", "dist/build.json"],
		},
		{
			compilerOptions: { tsBuildInfoFile: "dist/build.json" },
			name: "no build-info file without incremental or composite",
			outputPaths: ["dist/src/index.js"],
		},
	])(
		"returns $name",
		async ({ compilerOptions, outputPaths }, { expect, onTestFinished }) => {
			const projectDir = createTempProject(onTestFinished, {
				...SOURCE_FILES,
				"tsconfig.json": JSON.stringify({
					compilerOptions: { ...compilerOptions, outDir: "dist", rootDir: "." },
					include: ["src"],
				}),
			});

			const project = await loadProject(".", projectDir);

			expect(normalizePaths(project.outputPaths)).toStrictEqual(
				new Set(
					outputPaths.map((outputPath) => path.join(projectDir, outputPath)),
				),
			);
		},
	);

	it("accepts declarationDir when composite enables declarations", async ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempProject(onTestFinished, {
			...SOURCE_FILES,
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					composite: true,
					declarationDir: "types",
					outDir: "dist",
					rootDir: "src",
				},
				include: ["src"],
			}),
		});

		const project = await loadProject(".", projectDir);

		expect(project.declarationDir).toBe(path.join(projectDir, "types"));
		expect(normalizePaths(project.outputPaths)).toStrictEqual(
			new Set([
				path.join(projectDir, "dist/index.js"),
				path.join(projectDir, "tsconfig.tsbuildinfo"),
				path.join(projectDir, "types/index.d.ts"),
			]),
		);
	});

	it("derives output paths when noEmitOnError is enabled", async ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempProject(onTestFinished, {
			"src/index.ts": "export const value: number = 'invalid';",
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					noEmitOnError: true,
					outDir: "dist",
					rootDir: "src",
				},
			}),
		});

		const project = await loadProject(".", projectDir);

		expect(normalizePaths(project.outputPaths)).toStrictEqual(
			new Set([path.join(projectDir, "dist/index.js")]),
		);
	});

	it("resolves a --project directory to its tsconfig.json", async ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempProject(onTestFinished, {
			"nested/src/index.ts": "export const value = 1;",
			"nested/tsconfig.json": JSON.stringify({
				compilerOptions: { outDir: "dist", rootDir: "src" },
			}),
		});

		const project = await loadProject("nested", projectDir);

		expect(project.configFilePath).toBe(
			path.join(projectDir, "nested/tsconfig.json"),
		);
		expect(project.outDir).toBe(path.join(projectDir, "nested/dist"));
	});

	it("resolves package-based extends", async ({ expect, onTestFinished }) => {
		const projectDir = createTempProject(onTestFinished, {
			...SOURCE_FILES,
			"node_modules/package-config/config/tsconfig.json": JSON.stringify({
				compilerOptions: { outDir: "dist", rootDir: "../../../src" },
			}),
			"node_modules/package-config/package.json": JSON.stringify({
				tsconfig: "config/tsconfig.json",
			}),
			"tsconfig.json": JSON.stringify({ extends: "package-config" }),
		});

		const project = await loadProject(".", projectDir);

		expect(project.outDir).toBe(
			path.join(projectDir, "node_modules/package-config/config/dist"),
		);
	});

	it.for([
		{ name: "the parent directory", projectPath: ".." },
		{ name: "an absolute path outside", projectPath: os.tmpdir() },
	])(
		"refuses to read a tsconfig from $name",
		async ({ projectPath }, { expect, onTestFinished }) => {
			const projectDir = createTempProject(onTestFinished, SOURCE_FILES);

			await expect(loadProject(projectPath, projectDir)).rejects.toThrow(
				new UserError(
					"Refusing to traverse outside current working directory to read tsconfig.",
				),
			);
		},
	);

	it.for([
		{ config: undefined, diagnostic: "TS5083", name: "a missing config" },
		{
			config: '{ "compilerOptions": { ',
			diagnostic: "TS1005",
			name: "malformed JSON",
		},
		{
			config: JSON.stringify({ compilerOptions: { anInvalidOption: true } }),
			diagnostic: "TS5023",
			name: "an unknown compiler option",
		},
		{
			config: JSON.stringify({ extends: "./base.json" }),
			diagnostic: "TS1005",
			name: "a malformed extended config",
		},
	])(
		"reports diagnostics for $name",
		async ({ config, diagnostic }, { expect, onTestFinished }) => {
			const projectDir = createTempProject(onTestFinished, {
				...SOURCE_FILES,
				"base.json": '{ "compilerOptions": { ',
				...(config === undefined ? {} : { "tsconfig.json": config }),
			});

			const result = loadProject(".", projectDir);

			await expect(result).rejects.toThrow(UserError);
			await expect(result).rejects.toThrow(diagnostic);
		},
	);

	it.for([
		{
			compilerOptions: { noEmit: true, outDir: "dist" },
			message: "Refusing to clean outDir because noEmit is enabled.",
		},
		{
			compilerOptions: {
				module: "amd",
				outDir: "dist",
				outFile: "dist/bundle.js",
			},
			message: "outFile is not supported.",
		},
		{
			compilerOptions: {},
			message: "outDir is not set in tsconfig.json",
		},
		{
			compilerOptions: { declarationDir: "types", outDir: "dist" },
			message:
				"Refusing to clean declarationDir because declaration is not enabled.",
		},
	])(
		"refuses $message",
		async ({ compilerOptions, message }, { expect, onTestFinished }) => {
			const projectDir = createTempProject(onTestFinished, {
				...SOURCE_FILES,
				"tsconfig.json": JSON.stringify({
					compilerOptions: { ...compilerOptions, rootDir: "src" },
				}),
			});

			const result = loadProject(".", projectDir);

			await expect(result).rejects.toThrow(UserError);
			await expect(result).rejects.toThrow(message);
		},
	);
});

function createTempProject(
	onTestFinished: (cleanup: () => void) => void,
	files: Record<string, string>,
): string {
	const projectDir = realpath(
		fs.mkdtempSync(path.join(os.tmpdir(), "tsc-after-")),
	);
	onTestFinished(() => {
		fs.rmSync(projectDir, { force: true, recursive: true });
	});
	for (const [filePath, contents] of Object.entries(files)) {
		const absolutePath = path.join(projectDir, filePath);
		fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
		fs.writeFileSync(absolutePath, contents);
	}

	return projectDir;
}

function normalizePaths(filePaths: Iterable<string>): Set<string> {
	return new Set([...filePaths].map((filePath) => path.normalize(filePath)));
}
