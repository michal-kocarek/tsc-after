import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	CLEAN_MODES,
	cliOutcome,
	pathExists,
	readTree,
	runTscAfter,
	withProject,
} from "./project.ts";

describe("outDir safety", () => {
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
