import { randomUUID } from "node:crypto";
import { access, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
});
