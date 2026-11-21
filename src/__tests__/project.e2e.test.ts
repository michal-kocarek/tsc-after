import { randomUUID } from "node:crypto";
import {
	access,
	lstat,
	mkdir,
	readdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	e2eDir,
	repositoryRoot,
	runTsc,
	runTscAfter,
	withProject,
} from "./project.ts";

const sourceFile = "src/lib.ts";

async function pathExists(filePath: string) {
	try {
		await access(filePath);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

describe("e2e projects", () => {
	it("copies fixtures into isolated projects under the repository", async ({
		expect,
		task,
	}) => {
		const fixtureSource = join(
			repositoryRoot,
			"src/__tests__/fixtures/simple",
			sourceFile,
		);
		const fixtureContents = await readFile(fixtureSource, "utf8");

		let secondProjectDir = "";
		let secondProjectContents = "";
		let signalSecondReady!: () => void;
		let releaseSecondProject!: () => void;
		const secondReady = new Promise<void>((resolve) => {
			signalSecondReady = resolve;
		});
		const secondMayFinish = new Promise<void>((resolve) => {
			releaseSecondProject = resolve;
		});
		const secondProject = withProject(task, async (projectDir) => {
			secondProjectDir = projectDir;
			signalSecondReady();
			await secondMayFinish;
			secondProjectContents = await readFile(
				join(projectDir, sourceFile),
				"utf8",
			);
		});

		await secondReady;

		let firstProjectDir = "";
		let firstProjectState: {
			firstProjectParent: string;
			fixtureContents: string;
			modifiedContents: string;
			secondContents: string;
		};
		let secondProjectExistsAfterFirst: boolean;
		try {
			firstProjectState = await withProject(task, async (projectDir) => {
				firstProjectDir = projectDir;

				await writeFile(join(projectDir, sourceFile), "modified fixture copy");

				return {
					firstProjectParent: dirname(projectDir),
					fixtureContents: await readFile(fixtureSource, "utf8"),
					modifiedContents: await readFile(
						join(projectDir, sourceFile),
						"utf8",
					),
					secondContents: await readFile(
						join(secondProjectDir, sourceFile),
						"utf8",
					),
				};
			});

			secondProjectExistsAfterFirst = await pathExists(secondProjectDir);
		} finally {
			releaseSecondProject();
			await secondProject;
		}

		const firstProjectExistsAfterCallback = await pathExists(firstProjectDir);
		const secondProjectExistsAfterCallback = await pathExists(secondProjectDir);

		expect({
			firstProjectExistsAfterCallback,
			firstProjectParent: firstProjectState.firstProjectParent,
			fixtureContents: firstProjectState.fixtureContents,
			modifiedContents: firstProjectState.modifiedContents,
			secondContentsAfterFirst: secondProjectContents,
			secondContentsDuringFirst: firstProjectState.secondContents,
			secondProjectExistsAfterCallback,
			secondProjectExistsAfterFirst,
		}).toStrictEqual({
			firstProjectExistsAfterCallback: true,
			firstProjectParent: e2eDir,
			fixtureContents,
			modifiedContents: "modified fixture copy",
			secondContentsAfterFirst: fixtureContents,
			secondContentsDuringFirst: fixtureContents,
			secondProjectExistsAfterCallback: true,
			secondProjectExistsAfterFirst: true,
		});
	});

	it("retains a project after its callback throws", async ({
		expect,
		task,
	}) => {
		let projectDir = "";
		let callbackError: unknown;
		const error = new Error("callback failed");

		try {
			await withProject(task, (dirPath) => {
				projectDir = dirPath;
				throw error;
			});
		} catch (caughtError) {
			callbackError = caughtError;
		}

		const projectExistsAfterCallback = await pathExists(projectDir);

		expect({ callbackError, projectExistsAfterCallback }).toStrictEqual({
			callbackError: error,
			projectExistsAfterCallback: true,
		});
	});

	it("retains a project when fixture setup fails", async ({ expect, task }) => {
		const prefix = `setup-error-${randomUUID()}-`;
		const missingFixtureDir = join(
			repositoryRoot,
			"src/__tests__/fixtures/missing",
		);
		let callbackCalled = false;

		let setupError: unknown;
		try {
			await withProject(
				task,
				() => {
					callbackCalled = true;
				},
				{
					fixtureDir: missingFixtureDir,
					prefix,
				},
			);
		} catch (error) {
			setupError = error;
		}

		const retainedProjects = (await readdir(e2eDir)).filter((name) =>
			name.startsWith(prefix),
		);
		const retainedProjectDir = join(e2eDir, retainedProjects[0] ?? "");

		expect({
			callbackCalled,
			retainedProjectExists: await pathExists(retainedProjectDir),
			retainedProjects,
			setupFailed: setupError instanceof Error,
		}).toStrictEqual({
			callbackCalled: false,
			retainedProjectExists: true,
			retainedProjects: [expect.stringMatching(prefix)],
			setupFailed: true,
		});
	});

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

	it("treats missing output directories as a no-op in normal and dry modes", async ({
		expect,
		task,
	}) => {
		for (const outDir of ["dist", "missing-parent/dist"]) {
			for (const dry of [false, true]) {
				const cleanupState = await withProject(task, async (projectDir) => {
					await writeFile(
						join(projectDir, "tsconfig.json"),
						JSON.stringify({
							compilerOptions: { outDir, rootDir: "src" },
						}),
					);

					const sourceContents = await readFile(
						join(projectDir, sourceFile),
						"utf8",
					);
					const cleanup = await runTscAfter(dry ? ["--dry"] : [], {
						allowFailure: true,
						cwd: projectDir,
					});

					return {
						cleanup,
						outDirExists: await pathExists(join(projectDir, outDir)),
						sourceUnchanged:
							(await readFile(join(projectDir, sourceFile), "utf8")) ===
							sourceContents,
					};
				});

				expect({
					exitCode: cleanupState.cleanup.exitCode,
					expectedOutput:
						cleanupState.cleanup.stdout.includes(
							"Using tsconfig: tsconfig.json",
						) &&
						(!dry ||
							cleanupState.cleanup.stdout.includes(
								`tsc-after: Would remove 0 files from ${outDir}`,
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
			}
		}
	});

	it("does not treat a non-directory outDir as missing in normal or dry modes", async ({
		expect,
		task,
	}) => {
		for (const dry of [false, true]) {
			const cleanupState = await withProject(task, async (projectDir) => {
				const outDir = "not-a-directory";
				await writeFile(join(projectDir, outDir), "not a directory");
				await writeFile(
					join(projectDir, "tsconfig.json"),
					JSON.stringify({
						compilerOptions: { outDir, rootDir: "src" },
					}),
				);

				const sourceContents = await readFile(
					join(projectDir, sourceFile),
					"utf8",
				);
				const cleanup = await runTscAfter(dry ? ["--dry"] : [], {
					allowFailure: true,
					cwd: projectDir,
				});

				return {
					cleanup,
					sourceContents,
					sourceContentsAfter: await readFile(
						join(projectDir, sourceFile),
						"utf8",
					),
				};
			});

			expect(cleanupState.cleanup.exitCode).toBe(1);
			expect(cleanupState.cleanup.stderr).toContain("Not a directory");
			expect(cleanupState.cleanup.stdout).toContain(
				"Using tsconfig: tsconfig.json",
			);
			expect(cleanupState.sourceContentsAfter).toBe(
				cleanupState.sourceContents,
			);
		}
	});

	it("does not treat an outDir below a file as missing in normal or dry modes", async ({
		expect,
		task,
	}) => {
		for (const dry of [false, true]) {
			const cleanupState = await withProject(task, async (projectDir) => {
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

				const sourceContents = await readFile(
					join(projectDir, sourceFile),
					"utf8",
				);
				const cleanup = await runTscAfter(dry ? ["--dry"] : [], {
					allowFailure: true,
					cwd: projectDir,
				});

				return {
					cleanup,
					parentContents,
					parentContentsAfter: await readFile(
						join(projectDir, parentFile),
						"utf8",
					),
					sourceContents,
					sourceContentsAfter: await readFile(
						join(projectDir, sourceFile),
						"utf8",
					),
				};
			});

			expect(cleanupState.cleanup.exitCode).toBe(1);
			expect(cleanupState.cleanup.stderr).toContain("ENOTDIR");
			expect(cleanupState.cleanup.stdout).toContain(
				"Using tsconfig: tsconfig.json",
			);
			expect(cleanupState.parentContentsAfter).toBe(
				cleanupState.parentContents,
			);
			expect(cleanupState.sourceContentsAfter).toBe(
				cleanupState.sourceContents,
			);
		}
	});

	it("refuses to clean an outDir reached through a symbolic link", async ({
		expect,
		task,
	}) => {
		const cleanupState = await withProject(task, async (projectDir) => {
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

			const cleanup = await runTscAfter([], {
				allowFailure: true,
				cwd: projectDir,
			});

			return {
				exitCode: cleanup.exitCode,
				staleOutputExists: await pathExists(staleOutput),
				stderr: cleanup.stderr,
			};
		});

		expect(cleanupState).toStrictEqual({
			exitCode: 1,
			staleOutputExists: true,
			stderr: expect.stringContaining(
				"Refusing to clean outDir through a symbolic link: linked/dist!",
			),
		});
	});

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
});
