import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	TYPESCRIPT_4_0,
	TYPESCRIPT_4_2,
	typescriptVersion,
} from "../common/typescript/version.ts";
import {
	ISOLATED_COMPILER_OPTIONS,
	listEmittedFiles,
	pathExists,
	readTree,
	repositoryRoot,
	runTscAfter,
	toPlatformSep,
	withCleanModes,
	withProject,
	writeJson,
} from "./project.ts";

interface EmittedLayout {
	cleanupRoots?: string[];
	compilerOptions?: Record<string, unknown>;
	files?: string[];
	fixtureDir?: string;
	include?: string[];
	name: string;
	sourceFiles: Record<string, string>;
	staleFiles?: string[];
	typescript39Refusal?: string;
}

const defaultRootDirLayouts: EmittedLayout[] = [
	{
		include: ["src"],
		name: "single source directory without rootDir",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
	},
	{
		compilerOptions: { allowJs: true },
		include: ["src"],
		name: "allowJs",
		sourceFiles: {
			"src/helper.js": "export const helper = true;",
			"src/lib.ts": "export const value = 1;",
		},
	},
	{
		compilerOptions: { jsx: "preserve" },
		files: ["src/component.tsx", "src/lib.ts"],
		name: "JSX preserve",
		sourceFiles: {
			"src/component.tsx": "export const view = <div />;",
			"src/lib.ts": "export const value = 1;",
		},
	},
	{
		compilerOptions: { jsx: "react-native" },
		files: ["src/component.tsx"],
		name: "JSX react-native",
		sourceFiles: { "src/component.tsx": "export const view = <div />;" },
	},
	{
		compilerOptions: {
			declaration: true,
			declarationMap: true,
			sourceMap: true,
		},
		include: ["src"],
		name: "declaration, declarationMap, and sourceMap",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
	},
	{
		compilerOptions: { allowJs: true, declaration: true, jsx: "react" },
		files: ["src/component.jsx"],
		name: "allowJs JSX transformed with declarations",
		sourceFiles: { "src/component.jsx": "export const view = <div />;" },
		staleFiles: ["dist/stale.jsx"],
	},
	{
		compilerOptions: { allowJs: true, declaration: true, jsx: "preserve" },
		files: ["src/component.jsx"],
		name: "allowJs JSX preserved with declarations",
		sourceFiles: { "src/component.jsx": "export const view = <div />;" },
		staleFiles: ["dist/stale.jsx", "dist/stale.jsx.map"],
		typescript39Refusal:
			"Refusing to clean outDir: TypeScript 3.9 cannot safely determine outputs for allowJs JSX preserve with declaration.",
	},
	{
		compilerOptions: { jsx: "preserve", sourceMap: true },
		files: ["src/component.tsx"],
		name: "TSX preserved with sourceMap",
		sourceFiles: { "src/component.tsx": "export const view = <div />;" },
		staleFiles: ["dist/stale.jsx", "dist/stale.jsx.map"],
	},
	{
		compilerOptions: {
			declaration: true,
			jsx: "react",
			sourceMap: true,
		},
		files: ["src/component.tsx"],
		name: "TSX transformed with declarations and sourceMap",
		sourceFiles: { "src/component.tsx": "export const view = <div />;" },
	},
	{
		compilerOptions: {
			allowJs: true,
			declaration: true,
			declarationMap: true,
			sourceMap: true,
		},
		files: ["src/lib.js"],
		name: "allowJs declarations and maps",
		sourceFiles: { "src/lib.js": "export const value = 1;" },
		staleFiles: ["dist/stale.d.ts.map"],
	},
	{
		compilerOptions: { inlineSourceMap: true },
		include: ["src"],
		name: "inlineSourceMap",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
		staleFiles: ["dist/src/lib.js.map"],
	},
	{
		files: ["src/types.d.ts", "src/lib.ts"],
		name: "declaration source emits nothing",
		sourceFiles: {
			"src/lib.ts": "export const value = 1;",
			"src/types.d.ts": "export interface Types { value: string; }",
		},
		staleFiles: ["dist/types.js"],
	},
];

const emittedLayouts: EmittedLayout[] = [
	{
		compilerOptions: { rootDir: "src" },
		include: ["src"],
		name: "rootDir baseline",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
	},
	{
		cleanupRoots: ["dist", "types"],
		compilerOptions: {
			declaration: true,
			declarationDir: "types",
			rootDir: "src",
		},
		include: ["src"],
		name: "declarationDir outside outDir",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
		staleFiles: ["types/.tsc-after-stale.d.ts"],
	},
	{
		cleanupRoots: ["dist", "types"],
		compilerOptions: {
			declaration: true,
			declarationDir: "types",
			declarationMap: true,
			rootDir: "src",
		},
		include: ["src"],
		name: "declarationDir with declarationMap",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
		staleFiles: ["types/.tsc-after-stale.d.ts.map"],
	},
	{
		cleanupRoots: ["dist"],
		compilerOptions: {
			declaration: true,
			declarationDir: "dist/types",
			rootDir: "src",
		},
		include: ["src"],
		name: "declarationDir nested in outDir",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
		staleFiles: ["dist/types/.tsc-after-stale.d.ts"],
	},
	{
		cleanupRoots: ["dist/js", "dist"],
		compilerOptions: {
			declaration: true,
			declarationDir: "dist",
			outDir: "dist/js",
			rootDir: "src",
		},
		include: ["src"],
		name: "declarationDir containing outDir",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
		staleFiles: ["dist/.tsc-after-stale.d.ts", "dist/js/.tsc-after-stale.js"],
	},
	...defaultRootDirLayouts,
	...defaultRootDirLayouts.map((layout) => ({
		...layout,
		compilerOptions: { ...layout.compilerOptions, rootDir: "src" },
		name: `${layout.name} with rootDir`,
	})),
	{
		include: ["src", "scripts"],
		name: "multiple source directories without rootDir",
		sourceFiles: {
			"scripts/tool.ts": "export const tool = true;",
			"src/lib.ts": "export const value = 1;",
		},
	},
	{
		fixtureDir: join(repositoryRoot, "src/__tests__/fixtures/multi-root"),
		include: ["src", "scripts"],
		name: "multi-root fixture without rootDir",
		sourceFiles: {},
	},
	{
		include: ["src", "build.ts"],
		name: "directory and single-file include",
		sourceFiles: {
			"build.ts": "export const build = true;",
			"src/lib.ts": "export const value = 1;",
		},
	},
	{
		compilerOptions: { rootDir: "." },
		include: ["src", "scripts"],
		name: "multiple source directories with rootDir",
		sourceFiles: {
			"scripts/tool.ts": "export const tool = true;",
			"src/lib.ts": "export const value = 1;",
		},
	},
	{
		compilerOptions: { rootDir: "." },
		files: ["src/index.ts"],
		fixtureDir: join(
			repositoryRoot,
			"src/__tests__/fixtures/imports-outside-include",
		),
		name: "files root with imported file outside include",
		sourceFiles: {},
	},
	{
		compilerOptions: {
			baseUrl: ".",
			paths: { "@lib/*": ["lib/*"] },
			rootDir: ".",
		},
		files: ["src/index.ts"],
		name: "paths alias to file outside include",
		sourceFiles: {
			"lib/value.ts": "export const value = 1;",
			"src/index.ts": 'import { value } from "@lib/value"; export { value };',
		},
	},
	{
		compilerOptions: {
			esModuleInterop: true,
			module: "commonjs",
			moduleResolution: "node",
			resolveJsonModule: true,
			rootDir: ".",
		},
		files: ["src/index.ts"],
		name: "imported JSON outside include",
		sourceFiles: {
			"data/config.json": '{"value":1}',
			"src/index.ts":
				'import config from "../data/config.json"; export default config;',
		},
	},
	{
		compilerOptions: { rootDir: "." },
		include: ["src", "build.ts"],
		name: "directory and single-file include with rootDir",
		sourceFiles: {
			"build.ts": "export const build = true;",
			"src/lib.ts": "export const value = 1;",
		},
	},
	...(typescriptVersion >= 4_500_000
		? [
				{
					files: ["src/module.mts", "src/module.cts"],
					name: ".mts and .cts",
					sourceFiles: {
						"src/module.cts": "export const commonJs = true;",
						"src/module.mts": "export const esm = true;",
					},
				},
				{
					compilerOptions: {
						allowJs: true,
						declaration: true,
						declarationMap: true,
						rootDir: "src",
					},
					files: ["src/module.mjs", "src/module.cjs"],
					name: "declarations for .mjs and .cjs",
					sourceFiles: {
						"src/module.cjs": "exports.commonJs = true;",
						"src/module.mjs": "export const esm = true;",
					},
				},
				{
					compilerOptions: {
						declaration: true,
						declarationMap: true,
						sourceMap: true,
					},
					files: ["src/module.mts", "src/module.cts"],
					name: ".mts and .cts with declarations and maps",
					sourceFiles: {
						"src/module.cts": "export const commonJs = true;",
						"src/module.mts": "export const esm = true;",
					},
					staleFiles: [
						"dist/stale.d.mts",
						"dist/stale.d.cts",
						"dist/stale.mjs.map",
						"dist/stale.cjs.map",
					],
				},
			]
		: []),
	...(typescriptVersion >= 5_000_000
		? [
				{
					files: ["src/app.d.css.ts", "src/lib.ts"],
					name: "declaration source with arbitrary extension",
					sourceFiles: {
						"src/app.d.css.ts": "export interface CssModule { value: string; }",
						"src/lib.ts": "export const value = 1;",
					},
					staleFiles: ["dist/app.d.css.js"],
				},
			]
		: []),
	{
		compilerOptions: {
			declaration: true,
			emitDeclarationOnly: true,
			rootDir: "src",
		},
		include: ["src"],
		name: "emitDeclarationOnly removes previous JavaScript",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
		staleFiles: ["dist/lib.js"],
	},
	{
		compilerOptions: {
			declaration: true,
			declarationMap: true,
			emitDeclarationOnly: true,
			rootDir: "src",
		},
		include: ["src"],
		name: "emitDeclarationOnly with declarationMap",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
		staleFiles: ["dist/lib.js", "dist/lib.js.map"],
	},
	{
		compilerOptions: {
			declaration: true,
			declarationMap: true,
			emitDeclarationOnly: true,
			esModuleInterop: true,
			module: "commonjs",
			moduleResolution: "node",
			resolveJsonModule: true,
			rootDir: ".",
		},
		files: ["src/index.ts", "src/lib.ts"],
		name: "emitDeclarationOnly with imported JSON",
		sourceFiles: {
			"data/config.json": '{"value":1}',
			"src/index.ts":
				'import config from "../data/config.json"; export default config;',
			"src/lib.ts": "export const value = 1;",
		},
		staleFiles: [
			"dist/data/config.json",
			"dist/src/index.js",
			"dist/src/lib.js",
		],
		typescript39Refusal:
			"Refusing to clean outDir: TypeScript 3.9 cannot safely determine outputs for emitDeclarationOnly with resolveJsonModule.",
	},
];

const STALE_FILES = [
	"dist/.tsc-after-stale-root.js",
	"dist/src/.tsc-after-stale-nested.js",
	"dist/extra/deep/.tsc-after-stale-deep.js",
];

describe("emitted output layouts", () => {
	it.for(withCleanModes([{ name: "empty separate cleanup roots" }]))(
		"reports both $name ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						declaration: true,
						declarationDir: "types",
						outDir: "dist",
						rootDir: "src",
					},
					include: ["src"],
				});
				await listEmittedFiles(projectDir);

				const cleanup = await runTscAfter(args, { cwd: projectDir });

				expect(cleanup.stdout).toContain("Nothing to remove from dist");
				expect(cleanup.stdout).toContain("Nothing to remove from types");
			});
		},
	);

	it.for(withCleanModes(emittedLayouts))(
		"matches tsc output for $name ($mode)",
		async ({ args, mode, ...layout }, { expect, task }) => {
			await withProject(
				task,
				async (projectDir) => {
					for (const [fileName, contents] of Object.entries(
						layout.sourceFiles,
					)) {
						const filePath = join(projectDir, fileName);
						await mkdir(dirname(filePath), { recursive: true });
						await writeFile(filePath, contents);
					}

					const tsconfig = {
						compilerOptions: {
							...ISOLATED_COMPILER_OPTIONS,
							outDir: "dist",
							...layout.compilerOptions,
						},
						...(layout.files === undefined ? {} : { files: layout.files }),
						...(layout.include === undefined
							? {}
							: { include: layout.include }),
					};
					await writeJson(projectDir, "tsconfig.json", tsconfig);

					const emittedFiles = await listEmittedFiles(projectDir);

					const staleFiles = [...STALE_FILES, ...(layout.staleFiles ?? [])];
					for (const fileName of staleFiles) {
						const filePath = join(projectDir, fileName);
						await mkdir(dirname(filePath), { recursive: true });
						await writeFile(filePath, "stale");
					}

					if (
						typescriptVersion < TYPESCRIPT_4_2 &&
						layout.compilerOptions?.["rootDir"] === undefined
					) {
						const before = await readTree(projectDir);
						const cleanup = await runTscAfter(args, {
							allowFailure: true,
							cwd: projectDir,
						});

						expect(cleanup.exitCode).toBe(1);
						expect(cleanup.stderr).toContain(
							"Refusing to clean outDir: TypeScript 3.9 through 4.1 require rootDir to be set.",
						);
						await expect(readTree(projectDir)).resolves.toStrictEqual(before);

						return;
					}

					if (
						typescriptVersion < TYPESCRIPT_4_0 &&
						layout.typescript39Refusal !== undefined
					) {
						const before = await readTree(projectDir);
						const cleanup = await runTscAfter(args, {
							allowFailure: true,
							cwd: projectDir,
						});

						expect(cleanup.exitCode).toBe(1);
						expect(cleanup.stderr).toContain(layout.typescript39Refusal);
						await expect(readTree(projectDir)).resolves.toStrictEqual(before);

						return;
					}

					expect(emittedFiles.length).toBeGreaterThan(0);

					const sourceContents = await Promise.all(
						Object.keys(layout.sourceFiles).map((fileName) =>
							readFile(join(projectDir, fileName), "utf8"),
						),
					);
					const configContents = await readFile(
						join(projectDir, "tsconfig.json"),
						"utf8",
					);
					const cleanup = await runTscAfter(args, { cwd: projectDir });

					expect(cleanup.exitCode).toBe(0);
					expect(cleanup.stderr).toBe("");

					if (layout.cleanupRoots !== undefined) {
						const summaryLines = cleanup.stdout
							.split("\n")
							.filter((line) => line.startsWith("tsc-after:"));

						expect(summaryLines).toHaveLength(layout.cleanupRoots.length);

						for (const cleanupRoot of layout.cleanupRoots) {
							expect(
								summaryLines.some((line) =>
									line.endsWith(`from ${toPlatformSep(cleanupRoot)}`),
								),
							).toBe(true);
						}
					}

					for (const fileName of emittedFiles) {
						await expect(
							pathExists(join(projectDir, fileName)),
							`Expected emitted output to remain after cleanup: ${fileName}`,
						).resolves.toBe(true);

						if (mode === "dry") {
							expect(cleanup.stdout.split("\n")).not.toContain(
								`Would remove file: ${toPlatformSep(fileName)}`,
							);
						}
					}

					for (const fileName of staleFiles) {
						await expect(pathExists(join(projectDir, fileName))).resolves.toBe(
							mode === "dry",
						);

						if (mode === "dry") {
							expect(cleanup.stdout).toContain(
								`Would remove file: ${toPlatformSep(fileName)}`,
							);
						}
					}

					expect(
						await Promise.all(
							Object.keys(layout.sourceFiles).map((fileName) =>
								readFile(join(projectDir, fileName), "utf8"),
							),
						),
					).toStrictEqual(sourceContents);
					expect(
						await readFile(join(projectDir, "tsconfig.json"), "utf8"),
					).toBe(configContents);
				},
				layout.fixtureDir === undefined
					? {}
					: { fixtureDir: layout.fixtureDir },
			);
		},
	);

	it.for(withCleanModes([{ name: "inherited rootDir" }]))(
		"accepts $name ($mode)",
		async ({ args, mode }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "base.json", {
					compilerOptions: { rootDir: "src" },
				});
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: { ...ISOLATED_COMPILER_OPTIONS, outDir: "dist" },
					extends: "./base.json",
					include: ["src"],
				});
				const emittedFiles = await listEmittedFiles(projectDir);

				expect(emittedFiles.length).toBeGreaterThan(0);

				await writeFile(join(projectDir, "dist/stale.js"), "stale");

				const cleanup = await runTscAfter(args, { cwd: projectDir });

				expect(cleanup.exitCode).toBe(0);

				for (const fileName of emittedFiles) {
					await expect(pathExists(join(projectDir, fileName))).resolves.toBe(
						true,
					);
				}

				await expect(
					pathExists(join(projectDir, "dist/stale.js")),
				).resolves.toBe(mode === "dry");
			});
		},
	);

	it.for(
		withCleanModes([{ name: "nested project with inherited relative paths" }]),
	)(
		"matches tsc output for $name ($mode)",
		async ({ args, mode }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "config/base.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "../dist",
						rootDir: "../src",
					},
					include: ["../src"],
				});
				await writeJson(projectDir, "nested/tsconfig.json", {
					extends: "../config/base.json",
				});
				const emittedFiles = await listEmittedFiles(projectDir, [], "nested");

				expect(emittedFiles.length).toBeGreaterThan(0);

				await writeFile(join(projectDir, "dist/stale.js"), "stale");

				const cleanup = await runTscAfter(["--project", "nested", ...args], {
					cwd: projectDir,
				});

				expect(cleanup.exitCode).toBe(0);

				for (const fileName of emittedFiles) {
					await expect(pathExists(join(projectDir, fileName))).resolves.toBe(
						true,
					);
				}

				await expect(
					pathExists(join(projectDir, "dist/stale.js")),
				).resolves.toBe(mode === "dry");
			});
		},
	);
});
