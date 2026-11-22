import {
	lstat,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	CLEAN_MODES,
	ISOLATED_COMPILER_OPTIONS,
	pathExists,
	runTsc,
	runTscAfter,
	withCleanModes,
	withProject,
	writeJson,
} from "./project.ts";

describe("stale outputs", () => {
	it("retains emitted JavaScript, declarations, and maps", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await writeJson(projectDir, "tsconfig.json", {
				compilerOptions: {
					...ISOLATED_COMPILER_OPTIONS,
					declaration: true,
					declarationMap: true,
					outDir: "dist",
					rootDir: "src",
					sourceMap: true,
				},
			});
			await runTsc([], { cwd: projectDir });
			const outputs = [
				"index.js",
				"index.js.map",
				"index.d.ts",
				"index.d.ts.map",
			];
			const contents = await Promise.all(
				outputs.map((file) => readFile(join(projectDir, "dist", file), "utf8")),
			);
			await writeFile(join(projectDir, "dist/stale.js"), "stale");

			const cleanup = await runTscAfter([], { cwd: projectDir });

			expect(cleanup.exitCode).toBe(0);
			await expect(
				Promise.all(
					outputs.map((file) =>
						readFile(join(projectDir, "dist", file), "utf8"),
					),
				),
			).resolves.toStrictEqual(contents);
			await expect(pathExists(join(projectDir, "dist/stale.js"))).resolves.toBe(
				false,
			);
		});
	});

	it("retains outputs when declarationDir is separate from outDir", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await writeJson(projectDir, "tsconfig.json", {
				compilerOptions: {
					...ISOLATED_COMPILER_OPTIONS,
					declaration: true,
					declarationDir: "types",
					outDir: "dist",
					rootDir: "src",
				},
			});
			await runTsc([], { cwd: projectDir });
			const outputs = [
				join(projectDir, "dist/index.js"),
				join(projectDir, "types/index.d.ts"),
			];
			const contents = await Promise.all(
				outputs.map((file) => readFile(file, "utf8")),
			);
			await writeFile(join(projectDir, "dist/stale.js"), "stale");
			await writeFile(join(projectDir, "types/stale.d.ts"), "stale");

			const cleanup = await runTscAfter([], { cwd: projectDir });

			expect(cleanup.exitCode).toBe(0);
			await expect(
				Promise.all(outputs.map((file) => readFile(file, "utf8"))),
			).resolves.toStrictEqual(contents);
			await expect(pathExists(join(projectDir, "dist/stale.js"))).resolves.toBe(
				false,
			);
			await expect(
				pathExists(join(projectDir, "types/stale.d.ts")),
			).resolves.toBe(false);
		});
	});

	it.for(
		withCleanModes([
			{ configLocation: "root" },
			{ configLocation: "inherited" },
		]),
	)(
		"cleans outputs when watchOptions are in the $configLocation config ($mode)",
		async ({ args, configLocation, mode }, { expect, task }) => {
			const cleanupState = await withProject(task, async (projectDir) => {
				const compilerOptions = {
					outDir: "dist",
					rootDir: "src",
					...ISOLATED_COMPILER_OPTIONS,
				};
				const configWithWatchOptions = {
					compilerOptions,
					watchOptions: { watchFile: "useFsEvents" },
				};
				if (configLocation === "root") {
					await writeJson(projectDir, "tsconfig.json", configWithWatchOptions);
				} else {
					await writeJson(projectDir, "base.json", configWithWatchOptions);
					await writeJson(projectDir, "tsconfig.json", {
						extends: "./base.json",
					});
				}

				const compilation = await runTsc([], { cwd: projectDir });
				const emittedOutputPath = join(projectDir, "dist/index.js");
				const staleOutputPath = join(projectDir, "dist/stale.js");
				await writeFile(staleOutputPath, "stale output");
				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				return {
					cleanupExitCode: cleanup.exitCode,
					compilationExitCode: compilation.exitCode,
					emittedOutputExists: await pathExists(emittedOutputPath),
					staleOutputExists: await pathExists(staleOutputPath),
					stderr: cleanup.stderr,
				};
			});

			expect(cleanupState).toStrictEqual({
				cleanupExitCode: 0,
				compilationExitCode: 0,
				emittedOutputExists: true,
				staleOutputExists: mode === "dry",
				stderr: "",
			});
		},
	);

	it("removes stale outputs after tsc emits the project", async ({
		expect,
		task,
	}) => {
		const cleanupState = await withProject(task, async (projectDir) => {
			const staleSourceFile = join(projectDir, "src/lib.ts");
			const retainedSourceFile = join(projectDir, "src/index.ts");
			const staleOutput = join(projectDir, "dist/lib.js");
			const retainedOutput = join(projectDir, "dist/index.js");

			const compilation = await runTsc([], { cwd: projectDir });
			const outputsExistBeforeCleanup = await Promise.all([
				pathExists(staleOutput),
				pathExists(retainedOutput),
			]);

			const retainedSourceContents = await readFile(retainedSourceFile, "utf8");
			const retainedOutputContents = await readFile(retainedOutput, "utf8");
			await rm(staleSourceFile);

			const cleanup = await runTscAfter([], { cwd: projectDir });

			return {
				cleanupExitCode: cleanup.exitCode,
				compilationExitCode: compilation.exitCode,
				outputsExistBeforeCleanup,
				retainedOutputUnchanged:
					(await readFile(retainedOutput, "utf8")) === retainedOutputContents,
				retainedSourceUnchanged:
					(await readFile(retainedSourceFile, "utf8")) ===
					retainedSourceContents,
				staleOutputExistsAfterCleanup: await pathExists(staleOutput),
				staleSourceExistsAfterCleanup: await pathExists(staleSourceFile),
			};
		});

		expect(cleanupState).toStrictEqual({
			cleanupExitCode: 0,
			compilationExitCode: 0,
			outputsExistBeforeCleanup: [true, true],
			retainedOutputUnchanged: true,
			retainedSourceUnchanged: true,
			staleOutputExistsAfterCleanup: false,
			staleSourceExistsAfterCleanup: false,
		});
	});

	it.for(CLEAN_MODES)(
		"cleans a nested outDir without removing source files ($mode)",
		async ({ args, mode }, { expect, task }) => {
			const cleanupState = await withProject(task, async (projectDir) => {
				const configPath = join(projectDir, "tsconfig.json");
				const sourcePath = join(projectDir, "src/index.ts");
				const staleOutputPath = join(projectDir, "src/out/stale.js");
				const configContents = JSON.stringify({
					compilerOptions: { outDir: "src/out", rootDir: "src" },
				});
				const sourceContents = await readFile(sourcePath, "utf8");
				await writeFile(configPath, configContents);
				await mkdir(dirname(staleOutputPath), { recursive: true });
				await writeFile(staleOutputPath, "stale output");

				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				return {
					cleanup,
					configContentsAfter: await readFile(configPath, "utf8"),
					sourceContents,
					sourceContentsAfter: await readFile(sourcePath, "utf8"),
					staleOutputExists: await pathExists(staleOutputPath),
				};
			});

			expect({
				configContentsAfter: cleanupState.configContentsAfter,
				exitCode: cleanupState.cleanup.exitCode,
				sourceContents: cleanupState.sourceContents,
				sourceContentsAfter: cleanupState.sourceContentsAfter,
				staleOutputExists: cleanupState.staleOutputExists,
				stderr: cleanupState.cleanup.stderr,
			}).toStrictEqual({
				configContentsAfter: JSON.stringify({
					compilerOptions: { outDir: "src/out", rootDir: "src" },
				}),
				exitCode: 0,
				sourceContents: cleanupState.sourceContents,
				sourceContentsAfter: cleanupState.sourceContents,
				staleOutputExists: mode === "dry",
				stderr: "",
			});
		},
	);

	it("skips symbolic links inside outDir without following them", async ({
		expect,
		task,
	}) => {
		const cleanupState = await withProject(task, async (projectDir) => {
			const linkTarget = join(projectDir, "link-target");
			const linkTargetFile = join(linkTarget, "stale.js");
			const staleOutput = join(projectDir, "dist/stale.js");
			const links = ["dist/dir-link", "dist/file-link.js", "dist/dangling.js"];
			await mkdir(linkTarget);
			await mkdir(dirname(staleOutput));
			await writeFile(linkTargetFile, "stale-looking file behind a link");
			await writeFile(staleOutput, "stale output");
			await symlink(linkTarget, join(projectDir, "dist/dir-link"), "dir");
			await symlink(linkTargetFile, join(projectDir, "dist/file-link.js"));
			await symlink(
				join(linkTarget, "missing.js"),
				join(projectDir, "dist/dangling.js"),
			);

			const cleanup = await runTscAfter([], {
				allowFailure: true,
				cwd: projectDir,
			});

			return {
				exitCode: cleanup.exitCode,
				linksAreKept: await Promise.all(
					links.map(async (link) =>
						(await lstat(join(projectDir, link))).isSymbolicLink(),
					),
				),
				linkTargetFileExists: await pathExists(linkTargetFile),
				staleOutputExists: await pathExists(staleOutput),
				stderr: cleanup.stderr,
			};
		});

		expect(cleanupState).toStrictEqual({
			exitCode: 0,
			linksAreKept: [true, true, true],
			linkTargetFileExists: true,
			staleOutputExists: false,
			stderr: "",
		});
	});

	it.for(
		withCleanModes([{ outDir: "dist" }, { outDir: "missing-parent/dist" }]),
	)(
		"treats missing output directory $outDir as a no-op ($mode)",
		async ({ args, mode, outDir }, { expect, task }) => {
			const cleanupState = await withProject(task, async (projectDir) => {
				await writeFile(
					join(projectDir, "tsconfig.json"),
					JSON.stringify({
						compilerOptions: { outDir, rootDir: "src" },
					}),
				);

				const sourceContents = await readFile(
					join(projectDir, "src/lib.ts"),
					"utf8",
				);
				const cleanup = await runTscAfter(args, {
					allowFailure: true,
					cwd: projectDir,
				});

				return {
					cleanup,
					outDirExists: await pathExists(join(projectDir, outDir)),
					sourceUnchanged:
						(await readFile(join(projectDir, "src/lib.ts"), "utf8")) ===
						sourceContents,
				};
			});

			expect({
				exitCode: cleanupState.cleanup.exitCode,
				expectedOutput:
					cleanupState.cleanup.stdout.includes(
						"Using tsconfig: tsconfig.json",
					) &&
					(mode !== "dry" ||
						cleanupState.cleanup.stdout.includes(
							`tsc-after: Nothing to remove from ${outDir}`,
						)),
				outDirExists: cleanupState.outDirExists,
				sourceUnchanged: cleanupState.sourceUnchanged,
				stderr: cleanupState.cleanup.stderr,
			}).toStrictEqual({
				exitCode: 0,
				expectedOutput: true,
				outDirExists: false,
				sourceUnchanged: true,
				stderr: "",
			});
		},
	);
});
