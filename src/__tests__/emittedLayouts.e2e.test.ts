import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	TYPESCRIPT_7_1,
	typescriptVersion,
} from "../common/typescript/version.ts";
import {
	ISOLATED_COMPILER_OPTIONS,
	listEmittedFiles,
	pathExists,
	runTscAfter,
	withCleanModes,
	withProject,
	writeJson,
} from "./project.ts";

interface EmittedLayout {
	compilerOptions?: Record<string, unknown>;
	files?: string[];
	include?: string[];
	name: string;
	sourceFiles: Record<string, string>;
	staleFiles?: string[];
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
];

const emittedLayouts: EmittedLayout[] = [
	{
		compilerOptions: { rootDir: "src" },
		include: ["src"],
		name: "rootDir baseline",
		sourceFiles: { "src/lib.ts": "export const value = 1;" },
	},
	...(typescriptVersion >= 4_000_000 ? defaultRootDirLayouts : []),
	{
		include: ["src", "scripts"],
		name: "multiple source directories without rootDir",
		sourceFiles: {
			"scripts/tool.ts": "export const tool = true;",
			"src/lib.ts": "export const value = 1;",
		},
	},
	{
		include: ["src", "build.ts"],
		name: "directory and single-file include",
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
	...(typescriptVersion >= TYPESCRIPT_7_1
		? [
				{
					files: ["src/index.ts"],
					name: "imported file outside include",
					sourceFiles: {
						"lib/value.ts": "export const value = 1;",
						"src/index.ts":
							'import { value } from "../lib/value"; export { value };',
					},
				},
			]
		: []),
];

const STALE_FILES = [
	"dist/.tsc-after-stale-root.js",
	"dist/src/.tsc-after-stale-nested.js",
	"dist/extra/deep/.tsc-after-stale-deep.js",
];

describe("emitted output layouts", () => {
	it.for(withCleanModes(emittedLayouts))(
		"matches tsc output for $name ($mode)",
		async ({ args, mode, ...layout }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				for (const [fileName, contents] of Object.entries(layout.sourceFiles)) {
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
					...(layout.include === undefined ? {} : { include: layout.include }),
				};
				await writeJson(projectDir, "tsconfig.json", tsconfig);

				const emittedFiles = await listEmittedFiles(projectDir);

				expect(emittedFiles.length).toBeGreaterThan(0);

				const staleFiles = [...STALE_FILES, ...(layout.staleFiles ?? [])];
				for (const fileName of staleFiles) {
					const filePath = join(projectDir, fileName);
					await mkdir(dirname(filePath), { recursive: true });
					await writeFile(filePath, "stale");
				}

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

				for (const fileName of emittedFiles) {
					await expect(
						pathExists(join(projectDir, fileName)),
						`Expected emitted output to remain after cleanup: ${fileName}`,
					).resolves.toBe(true);

					if (mode === "dry") {
						expect(cleanup.stdout.split("\n")).not.toContain(
							`Would remove file: ${fileName}`,
						);
					}
				}

				for (const fileName of staleFiles) {
					await expect(pathExists(join(projectDir, fileName))).resolves.toBe(
						mode === "dry",
					);

					if (mode === "dry") {
						expect(cleanup.stdout).toContain(`Would remove file: ${fileName}`);
					}
				}

				expect(
					await Promise.all(
						Object.keys(layout.sourceFiles).map((fileName) =>
							readFile(join(projectDir, fileName), "utf8"),
						),
					),
				).toStrictEqual(sourceContents);
				expect(await readFile(join(projectDir, "tsconfig.json"), "utf8")).toBe(
					configContents,
				);
			});
		},
	);
});
