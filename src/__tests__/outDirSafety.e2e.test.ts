import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import ts from "typescript";
import { describe, it } from "vitest";

import {
	CLEAN_MODES,
	cliOutcome,
	ISOLATED_COMPILER_OPTIONS,
	pathExists,
	readTree,
	runTscAfter,
	withCleanModes,
	withProject,
	writeJson,
} from "./project.ts";

describe("outDir safety", () => {
	it.for(withCleanModes([{ name: "outFile" }]))(
		"refuses $name without changing files ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						module: "amd",
						outDir: "dist",
						outFile: "dist/bundle.js",
						rootDir: "src",
					},
					include: ["src"],
				});
				await mkdir(join(projectDir, "dist"));
				await writeFile(join(projectDir, "dist/bundle.js"), "keep");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining("outFile is not supported"),
				});
				await expect(readTree(projectDir)).resolves.toStrictEqual(before);
			});
		},
	);

	if (Number.parseInt(ts.version, 10) >= 7) {
		// These cases cover the TypeScript 7 adapter, which is not used by older compilers.
		// eslint-disable-next-line vitest/no-conditional-tests
		it("refuses cleanup when an extended package config cannot be resolved safely", async ({
			expect,
			task,
		}) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "node_modules",
						rootDir: "src",
					},
					extends: "shared-config",
				});
				await writeJson(projectDir, "outside.json", {});
				await writeJson(projectDir, "node_modules/shared-config/package.json", {
					main: "../../outside.json",
					tsconfig: "base.json",
				});
				await writeJson(projectDir, "node_modules/shared-config/base.json", {});
				await writeFile(join(projectDir, "node_modules/stale.js"), "keep");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter([], {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cleanup.exitCode).toBe(1);
				expect(cleanup.stderr).toContain(
					"Could not safely determine extended config",
				);
				await expect(readTree(projectDir)).resolves.toStrictEqual(before);
			});
		});

		// eslint-disable-next-line vitest/no-conditional-tests
		it("refuses cleanup when a transitively extended config is inside outDir", async ({
			expect,
			task,
		}) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "dist",
						rootDir: "src",
					},
					extends: ["./first.json"],
				});
				await writeJson(projectDir, "first.json", {
					extends: "./dist/base.json",
				});
				await writeJson(projectDir, "dist/base.json", {});
				await writeFile(join(projectDir, "dist/stale.js"), "keep");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter([], {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cleanup.exitCode).toBe(1);
				expect(cleanup.stderr).toContain(
					"contains config file 'dist/base.json'",
				);
				await expect(readTree(projectDir)).resolves.toStrictEqual(before);
			});
		});
	}

	it.for(CLEAN_MODES)(
		"refuses cleanup when noEmit is enabled ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						noEmit: true,
						outDir: "dist",
						rootDir: "src",
					},
				});
				await writeFile(
					join(projectDir, "src/index.ts"),
					"export const value = 1;",
				);
				await mkdir(join(projectDir, "dist"));
				await writeFile(join(projectDir, "dist/index.js"), "previous output");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean outDir because noEmit is enabled.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"keeps current outputs with noEmitOnError enabled ($mode)",
		async ({ args, mode }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						noEmitOnError: true,
						outDir: "dist",
						rootDir: "src",
					},
				});
				await writeFile(
					join(projectDir, "src/index.ts"),
					"export const value: number = 'invalid';",
				);
				await mkdir(join(projectDir, "dist"));
				await writeFile(join(projectDir, "dist/index.js"), "current output");
				await writeFile(join(projectDir, "dist/stale.js"), "stale output");

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cleanup.exitCode).toBe(0);
				expect(cleanup.stderr).toBe("");
				await expect(
					pathExists(join(projectDir, "dist/index.js")),
				).resolves.toBe(true);
				await expect(
					pathExists(join(projectDir, "dist/stale.js")),
				).resolves.toBe(mode === "dry");

				if (mode === "dry") {
					expect(cleanup.stdout).toContain("Would remove file: dist/stale.js");
				}
			});
		},
	);

	it("refuses to clean when the project config is inside outDir", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			const configPath = join(projectDir, "dist/tsconfig.json");
			const configContents = JSON.stringify({
				compilerOptions: { outDir: ".", rootDir: "../src" },
				include: ["../src"],
			});
			const staleOutputPath = join(projectDir, "dist/stale.js");
			await mkdir(dirname(configPath), { recursive: true });
			await writeFile(configPath, configContents);
			await writeFile(staleOutputPath, "keep stale output\n");
			const before = await readTree(projectDir);

			const cleanup = await runTscAfter(["--project", "dist"], {
				allowFailure: true,
				cwd: projectDir,
			});

			expect(cliOutcome(cleanup)).toStrictEqual({
				exitCode: 1,
				hasStackTrace: false,
				stderr: expect.stringContaining(
					"Refusing to clean outDir 'dist': it contains config file 'dist/tsconfig.json'.",
				),
			});
			await expect(readTree(projectDir)).resolves.toStrictEqual(before);
		});
	});

	it.for(CLEAN_MODES)(
		"does not treat a non-directory outDir as missing ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				const outDir = "not-a-directory";
				await writeFile(join(projectDir, outDir), "not a directory");
				await writeFile(
					join(projectDir, "tsconfig.json"),
					JSON.stringify({
						compilerOptions: { outDir, rootDir: "src" },
					}),
				);

				const before = await readTree(projectDir);
				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cleanup.exitCode).toBe(1);
				expect(cleanup.stderr).toContain("Not a directory");
				expect(cleanup.stdout).toContain("Using tsconfig: tsconfig.json");
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"does not treat an outDir below a file as missing ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				const parentFile = "not-a-directory";
				const parentContents = "not a directory";
				const outDir = join(parentFile, "dist");
				await writeFile(join(projectDir, parentFile), parentContents);
				await writeFile(
					join(projectDir, "tsconfig.json"),
					JSON.stringify({
						compilerOptions: { outDir, rootDir: "src" },
					}),
				);

				const before = await readTree(projectDir);
				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cleanup.exitCode).toBe(1);
				expect(cleanup.stderr).toContain("ENOTDIR");
				expect(cleanup.stdout).toContain("Using tsconfig: tsconfig.json");
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it("refuses to clean an outDir reached through a symbolic link", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			const linkTarget = join(projectDir, "link-target");
			const staleOutput = join(linkTarget, "dist/stale.js");
			await mkdir(dirname(staleOutput), { recursive: true });
			await writeFile(staleOutput, "stale output");
			await symlink(linkTarget, join(projectDir, "linked"), "dir");
			await writeFile(
				join(projectDir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { outDir: "linked/dist", rootDir: "src" },
				}),
			);
			const before = await readTree(projectDir);

			const cleanup = await runTscAfter([], {
				allowFailure: true,
				cwd: projectDir,
			});

			expect({
				exitCode: cleanup.exitCode,
				staleOutputExists: await pathExists(staleOutput),
				stderr: cleanup.stderr,
			}).toStrictEqual({
				exitCode: 1,
				staleOutputExists: true,
				stderr: expect.stringContaining(
					"Refusing to clean outDir through a symbolic link: linked/dist!",
				),
			});
			await expect(readTree(projectDir)).resolves.toStrictEqual(before);
		});
	});

	it.for(CLEAN_MODES)(
		"refuses to clean when outDir contains a listed source file ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				const configContents = JSON.stringify({
					compilerOptions: { outDir: "src", rootDir: "src" },
					files: ["src/index.ts"],
				});
				const configPath = join(projectDir, "tsconfig.json");
				const sourcePath = join(projectDir, "src/index.ts");
				const extraFilePath = join(projectDir, "src/README.md");
				const sourceContents = "export const source = true;\n";
				const extraFileContents = "Keep this project file.\n";
				await writeFile(configPath, configContents);
				await writeFile(sourcePath, sourceContents);
				await writeFile(extraFilePath, extraFileContents);
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean outDir 'src': it contains source file 'src/index.ts'.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean when a source file resolves into outDir ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				const sourceDir = join(projectDir, "src");
				const realSourceDir = join(projectDir, "out/real");
				const realSourcePath = join(realSourceDir, "index.ts");
				const configContents = JSON.stringify({
					compilerOptions: {
						outDir: "out",
						preserveSymlinks: true,
						rootDir: "src",
					},
					files: ["src/index.ts"],
				});
				const configPath = join(projectDir, "tsconfig.json");
				const sourceContents = "export const source = true;\n";
				await rm(sourceDir, { recursive: true });
				await mkdir(realSourceDir, { recursive: true });
				await writeFile(realSourcePath, sourceContents);
				await symlink(realSourceDir, sourceDir, "dir");
				await writeFile(configPath, configContents);
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean outDir 'out': it contains source file",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean when outDir contains an imported-only source ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "out",
						rootDir: ".",
					},
					files: ["src/index.ts"],
				});
				await mkdir(join(projectDir, "out"));
				await writeFile(
					join(projectDir, "src/index.ts"),
					'import "../out/imported";\n',
				);
				await writeFile(
					join(projectDir, "out/imported.ts"),
					"export const imported = true;\n",
				);
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean outDir 'out': it contains source file 'out/imported.ts'.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean when outDir contains a paths-alias source ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						baseUrl: ".",
						outDir: "out",
						paths: { "@source": ["out/aliased.ts"] },
						rootDir: ".",
					},
					files: ["src/index.ts"],
				});
				await mkdir(join(projectDir, "out"));
				await writeFile(
					join(projectDir, "src/index.ts"),
					'import { value } from "@source";\nconsole.log(value);\n',
				);
				await writeFile(
					join(projectDir, "out/aliased.ts"),
					"export const value = true;\n",
				);
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean outDir 'out': it contains source file 'out/aliased.ts'.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean when outDir contains an imported declaration file ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "out",
						rootDir: ".",
					},
					files: ["src/index.ts"],
				});
				await mkdir(join(projectDir, "out"));
				await writeFile(
					join(projectDir, "src/index.ts"),
					'import type { Value } from "../out/types";\nconst value: Value = { text: "value" };\nconsole.log(value);\n',
				);
				await writeFile(
					join(projectDir, "out/types.d.ts"),
					"export interface Value { text: string }\n",
				);
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean outDir 'out': it contains source file 'out/types.d.ts'.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean when declarationDir contains a program source ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						declaration: true,
						declarationDir: "types",
						outDir: "dist",
						rootDir: ".",
					},
					files: ["src/index.ts"],
				});
				await writeFile(
					join(projectDir, "src/index.ts"),
					'import "../types/source";\n',
				);
				await mkdir(join(projectDir, "types"), { recursive: true });
				await writeFile(
					join(projectDir, "types/source.ts"),
					"export const value = true;\n",
				);
				await mkdir(join(projectDir, "dist"));
				await writeFile(join(projectDir, "dist/stale.js"), "keep");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean declarationDir 'types': it contains source file 'types/source.ts'.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean when declarationDir contains an extended config ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "types/base.json", {});
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						declaration: true,
						declarationDir: "types",
						outDir: "dist",
						rootDir: "src",
					},
					extends: "./types/base.json",
				});
				await mkdir(join(projectDir, "dist"));
				await writeFile(join(projectDir, "dist/stale.js"), "keep");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean declarationDir 'types': it contains config file 'types/base.json'.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(
		withCleanModes([
			{
				declarationDir: "../outside",
				name: "outside current working directory",
			},
			{ declarationDir: ".", name: "containing current working directory" },
		]),
	)(
		"refuses declarationDir $name ($mode)",
		async ({ args, declarationDir }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						declaration: true,
						declarationDir,
						outDir: "dist",
						rootDir: "src",
					},
					files: ["src/index.ts"],
				});
				await mkdir(join(projectDir, "dist"), { recursive: true });
				await writeFile(join(projectDir, "dist/stale.js"), "stale");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to traverse outside safe paths containing tsconfig to process declarationDir!",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean declarationDir through a symbolic link ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await mkdir(join(projectDir, "types-target"));
				await writeFile(join(projectDir, "types-target/stale.d.ts"), "stale");
				await symlink(
					join(projectDir, "types-target"),
					join(projectDir, "types-link"),
					"dir",
				);
				await mkdir(join(projectDir, "dist"));
				await writeFile(join(projectDir, "dist/stale.js"), "keep");
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						declaration: true,
						declarationDir: "types-link",
						outDir: "dist",
						rootDir: "src",
					},
				});
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean declarationDir through a symbolic link: types-link!",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses declarationDir when declaration emit is disabled ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						declarationDir: "types",
						outDir: "dist",
						rootDir: "src",
					},
				});
				await mkdir(join(projectDir, "types"));
				await writeFile(join(projectDir, "types/stale.d.ts"), "stale");
				await mkdir(join(projectDir, "dist"));
				await writeFile(join(projectDir, "dist/stale.js"), "keep");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean declarationDir because declaration is not enabled.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(CLEAN_MODES)(
		"refuses to clean when outDir contains an extended config ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				const extendedConfigPath = join(projectDir, "dist/base.json");
				const configPath = join(projectDir, "tsconfig.json");
				const extendedConfigContents = JSON.stringify({ compilerOptions: {} });
				const configContents = JSON.stringify({
					compilerOptions: { outDir: "dist", rootDir: "src" },
					extends: "./dist/base.json",
				});
				await mkdir(dirname(extendedConfigPath), { recursive: true });
				await writeFile(extendedConfigPath, extendedConfigContents);
				await writeFile(configPath, configContents);
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(
						"Refusing to clean outDir 'dist': it contains config file 'dist/base.json'.",
					),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);
});
