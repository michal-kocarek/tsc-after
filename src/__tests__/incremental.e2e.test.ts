import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "vitest";

import {
	CLEAN_MODES,
	ISOLATED_COMPILER_OPTIONS,
	listEmittedFiles,
	pathExists,
	runTsc,
	runTscAfter,
	toPlatformSep,
	withProject,
	writeJson,
} from "./project.ts";

describe("incremental builds", () => {
	it("preserves build info through cleanup so the next compile emits nothing", async ({
		expect,
		task,
	}) => {
		const state = await withProject(task, async (projectDir) => {
			await writeJson(projectDir, "tsconfig.json", {
				compilerOptions: {
					...ISOLATED_COMPILER_OPTIONS,
					incremental: true,
					outDir: "dist",
					rootDir: ".",
				},
				include: ["src"],
			});
			await runTsc([], { cwd: projectDir });

			const tsBuildInfoFile = join(projectDir, "dist/tsconfig.tsbuildinfo");
			const staleOutput = join(projectDir, "dist/stale.js");
			await writeFile(staleOutput, "stale output");

			const cleanup = await runTscAfter(["--verbose"], {
				cwd: projectDir,
			});
			const emittedFiles = await listEmittedFiles(projectDir);

			return {
				buildInfoExists: await pathExists(tsBuildInfoFile),
				cleanupExitCode: cleanup.exitCode,
				cleanupStdout: cleanup.stdout,
				emittedFiles,
				staleOutputExists: await pathExists(staleOutput),
			};
		});

		expect(state.cleanupExitCode).toBe(0);
		expect(state.buildInfoExists).toBe(true);
		expect(state.staleOutputExists).toBe(false);
		expect(state.emittedFiles).toStrictEqual([]);
		expect(state.cleanupStdout).toContain(
			toPlatformSep(
				"Skipped (expected output file): dist/tsconfig.tsbuildinfo",
			),
		);
	}, 30_000);

	it.for(CLEAN_MODES)(
		"removes stale default build info when incremental is off ($mode)",
		async ({ args, mode }, { expect, task }) => {
			const state = await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "dist",
						rootDir: ".",
					},
					include: ["src"],
				});
				const staleBuildInfo = join(projectDir, "dist/tsconfig.tsbuildinfo");
				await mkdir(join(projectDir, "dist"), { recursive: true });
				await writeFile(staleBuildInfo, "stale build info");

				const cleanup = await runTscAfter(args, { cwd: projectDir });

				return {
					cleanupStdout: cleanup.stdout,
					staleBuildInfoExists: await pathExists(staleBuildInfo),
				};
			});

			expect(state.staleBuildInfoExists).toBe(mode === "dry");
			expect(
				state.cleanupStdout.includes(
					toPlatformSep("Would remove file: dist/tsconfig.tsbuildinfo"),
				),
			).toBe(mode === "dry");
		},
	);

	it.for(CLEAN_MODES)(
		"treats ignored tsBuildInfoFile as stale ($mode)",
		async ({ args, mode }, { expect, task }) => {
			const state = await withProject(task, async (projectDir) => {
				await writeJson(projectDir, "tsconfig.json", {
					compilerOptions: {
						...ISOLATED_COMPILER_OPTIONS,
						outDir: "dist",
						rootDir: ".",
						tsBuildInfoFile: "dist/state/build.json",
					},
					include: ["src"],
				});
				const tsBuildInfoFile = join(projectDir, "dist/state/build.json");
				await mkdir(join(projectDir, "dist/state"), { recursive: true });
				await writeFile(tsBuildInfoFile, "ignored build info");

				const cleanup = await runTscAfter(args, { cwd: projectDir });

				return {
					cleanupStdout: cleanup.stdout,
					tsBuildInfoFileExists: await pathExists(tsBuildInfoFile),
				};
			});

			expect(state.tsBuildInfoFileExists).toBe(mode === "dry");
			expect(
				state.cleanupStdout.includes(
					toPlatformSep("Would remove file: dist/state/build.json"),
				),
			).toBe(mode === "dry");
		},
	);
});
