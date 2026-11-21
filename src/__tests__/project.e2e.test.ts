import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	e2eDir,
	pathExists,
	repositoryRoot,
	SOURCE_FILE,
	withProject,
} from "./project.ts";

describe("e2e projects", () => {
	it("copies fixtures into isolated projects under the repository", async ({
		expect,
		task,
	}) => {
		const fixtureSource = join(
			repositoryRoot,
			"src/__tests__/fixtures/simple",
			SOURCE_FILE,
		);
		const prefix = `isolated-${randomUUID()}-`;
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
		const secondProject = withProject(
			task,
			async (projectDir) => {
				secondProjectDir = projectDir;
				signalSecondReady();
				await secondMayFinish;
				secondProjectContents = await readFile(
					join(projectDir, SOURCE_FILE),
					"utf8",
				);
			},
			{ prefix },
		);

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
			firstProjectState = await withProject(
				task,
				async (projectDir) => {
					firstProjectDir = projectDir;

					await writeFile(
						join(projectDir, SOURCE_FILE),
						"modified fixture copy",
					);

					return {
						firstProjectParent: dirname(projectDir),
						fixtureContents: await readFile(fixtureSource, "utf8"),
						modifiedContents: await readFile(
							join(projectDir, SOURCE_FILE),
							"utf8",
						),
						secondContents: await readFile(
							join(secondProjectDir, SOURCE_FILE),
							"utf8",
						),
					};
				},
				{ prefix },
			);

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
			firstProjectUsesPrefix: basename(firstProjectDir).startsWith(prefix),
			fixtureContents: firstProjectState.fixtureContents,
			modifiedContents: firstProjectState.modifiedContents,
			projectDirsAreUnique: firstProjectDir !== secondProjectDir,
			secondContentsAfterFirst: secondProjectContents,
			secondContentsDuringFirst: firstProjectState.secondContents,
			secondProjectExistsAfterCallback,
			secondProjectExistsAfterFirst,
			secondProjectUsesPrefix: basename(secondProjectDir).startsWith(prefix),
		}).toStrictEqual({
			firstProjectExistsAfterCallback: true,
			firstProjectParent: e2eDir,
			firstProjectUsesPrefix: true,
			fixtureContents,
			modifiedContents: "modified fixture copy",
			projectDirsAreUnique: true,
			secondContentsAfterFirst: fixtureContents,
			secondContentsDuringFirst: fixtureContents,
			secondProjectExistsAfterCallback: true,
			secondProjectExistsAfterFirst: true,
			secondProjectUsesPrefix: true,
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
		const [retainedProject] = retainedProjects;
		const retainedProjectDir =
			retainedProjects.length === 1 && retainedProject !== undefined
				? join(e2eDir, retainedProject)
				: undefined;

		expect({
			callbackCalled,
			retainedProjectIsDirectory:
				retainedProjectDir !== undefined &&
				(await lstat(retainedProjectDir)).isDirectory(),
			retainedProjects,
			setupFailed:
				setupError instanceof Error &&
				"code" in setupError &&
				setupError.code === "ENOENT",
		}).toStrictEqual({
			callbackCalled: false,
			retainedProjectIsDirectory: true,
			retainedProjects: [expect.stringMatching(prefix)],
			setupFailed: true,
		});
	});
});
