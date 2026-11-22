import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	cliOutcome,
	ISOLATED_COMPILER_OPTIONS,
	listEmittedFiles,
	pathExists,
	readIfExists,
	readTree,
	runTsc,
	runTscAfter,
	SOURCE_FILE,
	toPlatformSep,
	withCleanModes,
	withProject,
	writeJson,
} from "./project.ts";

const PROJECT_OPTIONS = [
	{ configFile: "tsconfig.json", name: ".", project: "." },
	{ configFile: "nested/tsconfig.json", name: "nested", project: "nested" },
	{
		configFile: "tsconfig.json",
		name: "absolute path",
		project: undefined,
	},
	{
		configFile: "nested/tsconfig.json",
		name: "nested/",
		project: "nested/",
	},
	{ configFile: "custom.json", name: "custom.json", project: "custom.json" },
] as const;

const INVALID_CONFIGS = [
	{ config: undefined, diagnostic: "TS5083", name: "missing tsconfig.json" },
	{
		config: '{ "compilerOptions": { "outDir": "dist" ',
		diagnostic: "TS1005",
		name: "malformed JSON",
	},
	{
		config: JSON.stringify({
			compilerOptions: { outDir: "dist", rootDir: "src" },
			extends: "./missing-base.json",
		}),
		diagnostic: "TS5083",
		name: "missing extends target",
	},
	{
		config: JSON.stringify({
			compilerOptions: { bogusOption: true, outDir: "dist", rootDir: "src" },
		}),
		diagnostic: "TS5023",
		name: "unknown compiler option",
	},
	{
		config: JSON.stringify({
			compilerOptions: { outDir: "src" },
			include: ["src"],
		}),
		diagnostic: "TS18003",
		name: "config without source files",
	},
] as const;

async function writeProjectLayouts(projectDir: string): Promise<void> {
	const config = {
		compilerOptions: {
			...ISOLATED_COMPILER_OPTIONS,
			outDir: "dist",
			rootDir: "src",
		},
		include: ["src"],
	};
	await writeJson(projectDir, "tsconfig.json", config);
	await writeJson(projectDir, "custom.json", config);
	await writeJson(projectDir, "nested/tsconfig.json", config);
	await mkdir(join(projectDir, "nested/src"), { recursive: true });
	await writeFile(
		join(projectDir, "nested/src/index.ts"),
		"export const retained = true;\n",
	);
}

describe("--project option", () => {
	it.for(PROJECT_OPTIONS)(
		"accepts --project $name like tsc",
		async ({ configFile, project }, { expect, task }) => {
			const cleanupState = await withProject(task, async (projectDir) => {
				await writeProjectLayouts(projectDir);

				const configDir = dirname(configFile);
				const sourcePath = join(projectDir, configDir, SOURCE_FILE);
				const outDirPath = join(projectDir, configDir, "dist");
				const staleOutputPath = join(outDirPath, "lib.js");
				const retainedOutputPath = join(outDirPath, "index.js");
				const projectArg = project ?? projectDir;
				await writeFile(sourcePath, "export const stale = true;\n");

				const compilation = await runTsc(["--project", projectArg], {
					cwd: projectDir,
				});
				const outputsExistBeforeCleanup = await Promise.all([
					pathExists(staleOutputPath),
					pathExists(retainedOutputPath),
				]);
				await rm(sourcePath);
				const cleanup = await runTscAfter(["--project", projectArg], {
					cwd: projectDir,
				});

				return {
					cleanupExitCode: cleanup.exitCode,
					compilationExitCode: compilation.exitCode,
					configFileDisplayed: cleanup.stdout.includes(
						`Using tsconfig: ${toPlatformSep(configFile)}`,
					),
					outputsExistBeforeCleanup,
					retainedOutputExistsAfterCleanup:
						await pathExists(retainedOutputPath),
					staleOutputExistsAfterCleanup: await pathExists(staleOutputPath),
				};
			});

			expect(cleanupState).toStrictEqual({
				cleanupExitCode: 0,
				compilationExitCode: 0,
				configFileDisplayed: true,
				outputsExistBeforeCleanup: [true, true],
				retainedOutputExistsAfterCleanup: true,
				staleOutputExistsAfterCleanup: false,
			});
		},
	);

	it.for([{ project: "missing-project" }, { project: "empty-project" }])(
		"refuses missing --project path $project without changing project files",
		async ({ project }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				if (project === "empty-project") {
					await mkdir(join(projectDir, project));
				}
				const staleOutputPath = join(projectDir, "dist/stale.js");
				await mkdir(dirname(staleOutputPath), { recursive: true });
				await writeFile(staleOutputPath, "keep stale output\n");
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(["--project", project], {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining("TS5083"),
				});
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(withCleanModes([{ name: "inherited relative paths" }]))(
		"resolves an extends chain through --project ($mode)",
		async ({ args, mode }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "config/base.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "../outputs",
						rootDir: "../src",
					},
					include: ["../src"],
				});
				await writeJson(projectDir, "config/middle.json", {
					extends: "./base.json",
				});
				await writeJson(projectDir, "nested/tsconfig.json", {
					extends: "../config/middle.json",
				});
				const emittedFiles = await listEmittedFiles(projectDir, [], "nested");

				expect(emittedFiles.length).toBeGreaterThan(0);

				await writeFile(join(projectDir, "outputs/stale.js"), "stale");

				const cleanup = await runTscAfter([...args, "--project", "nested"], {
					cwd: projectDir,
				});

				expect(cleanup.exitCode).toBe(0);

				for (const file of emittedFiles) {
					await expect(pathExists(join(projectDir, file))).resolves.toBe(true);
				}

				await expect(
					pathExists(join(projectDir, "outputs/stale.js")),
				).resolves.toBe(mode === "dry");
			});
		},
	);

	it.for(withCleanModes(INVALID_CONFIGS))(
		"refuses $name without changing project files ($mode)",
		async ({ args, config, diagnostic }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				const configPath = join(projectDir, "tsconfig.json");
				if (config === undefined) {
					await rm(configPath);
				} else {
					await writeFile(configPath, config);
				}
				await writeFile(
					join(projectDir, "src/index.ts"),
					"export const source = true;\n",
				);
				await writeFile(
					join(projectDir, "src/README.md"),
					"Keep this project file.\n",
				);
				await mkdir(join(projectDir, "dist"), { recursive: true });
				await writeFile(
					join(projectDir, "dist/stale.js"),
					"keep stale output\n",
				);
				const before = await readTree(projectDir);

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				expect(cliOutcome(cleanup)).toStrictEqual({
					exitCode: 1,
					hasStackTrace: false,
					stderr: expect.stringContaining(diagnostic),
				});
				expect(await readIfExists(configPath)).toBe(config);
				expect(await readTree(projectDir)).toStrictEqual(before);
			});
		},
	);

	it.for(withCleanModes([{ name: "malformed extended config" }]))(
		"refuses $name without changing project files ($mode)",
		async ({ args }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: { outDir: "dist", rootDir: "src" },
					extends: "./base.json",
				});
				await writeFile(
					join(projectDir, "base.json"),
					'{ "compilerOptions": { ',
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
					stderr: expect.stringContaining("TS1005"),
				});
				await expect(readTree(projectDir)).resolves.toStrictEqual(before);
			});
		},
	);
});
