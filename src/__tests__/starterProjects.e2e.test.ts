import { mkdir, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	parseTypeScriptVersion,
	typescriptVersion,
} from "../common/typescript/version.ts";
import {
	listEmittedFiles,
	pathExists,
	readTree,
	repositoryRoot,
	runTsc,
	runTscAfter,
	toPlatformSep,
	withCleanModes,
	withProject,
} from "./project.ts";

const require = createRequire(import.meta.url);

const MINIMUM_TYPESCRIPT_3_9 = parseTypeScriptVersion("3.9.0");
const MINIMUM_TYPESCRIPT_5_9 = parseTypeScriptVersion("5.9.0");
const MINIMUM_TYPESCRIPT_6_0 = parseTypeScriptVersion("6.0.0");

const starterProjects: readonly StarterProject[] = [
	{
		expectedStaleFiles: ["dist/utils/format.js"],
		fixtureDir: join(repositoryRoot, "src/__tests__/fixtures/tsc-init-5.8"),
		minimumTypeScriptVersion: MINIMUM_TYPESCRIPT_3_9,
		name: "tsc-init-5.8",
	},
	{
		expectedStaleFiles: [
			"dist/utils/format.d.ts",
			"dist/utils/format.d.ts.map",
			"dist/utils/format.js",
			"dist/utils/format.js.map",
		],
		fixtureDir: join(repositoryRoot, "src/__tests__/fixtures/tsc-init-6.0"),
		minimumTypeScriptVersion: MINIMUM_TYPESCRIPT_5_9,
		name: "tsc-init-6.0",
	},
	{
		expectedStaleFiles: ["dist/utils/format.js"],
		fixtureDir: join(repositoryRoot, "src/__tests__/fixtures/node-lts"),
		minimumTypeScriptVersion: MINIMUM_TYPESCRIPT_6_0,
		name: "node-lts",
		withNodeLtsDependencies: true,
	},
];

interface StarterProject {
	expectedStaleFiles: string[];
	fixtureDir: string;
	minimumTypeScriptVersion: number;
	name: string;
	withNodeLtsDependencies?: boolean;
}

const nodeLtsDependencies = ["@tsconfig/node-lts", "@types/node"];

describe.each(starterProjects)("starter project $name", (starterProject) => {
	describe.runIf(typescriptVersion >= starterProject.minimumTypeScriptVersion)(
		"supported TypeScript version",
		() => {
			it("does not remove outputs after a fresh build", async ({
				expect,
				task,
			}) => {
				await withProject(
					task,
					async (projectDir) => {
						await linkNodeLtsDependenciesIfNeeded(starterProject, projectDir);
						await runTsc([], { cwd: projectDir });
						const treeBeforeCleanup = await readTree(projectDir);

						const cleanup = await runTscAfter([], { cwd: projectDir });

						expect(cleanup.exitCode).toBe(0);
						expect(cleanup.stderr).toBe("");
						await expect(readTree(projectDir)).resolves.toStrictEqual(
							treeBeforeCleanup,
						);
						await expect(
							existingNodeLtsDependencies(starterProject, projectDir),
						).resolves.toStrictEqual(
							starterProject.withNodeLtsDependencies === true
								? [true, true]
								: [],
						);
					},
					{ fixtureDir: starterProject.fixtureDir },
				);
			});

			it.for(withCleanModes([{ name: "deleted source outputs" }]))(
				"cleans $name in $mode mode",
				async ({ args, mode }, { expect, task }) => {
					await withProject(
						task,
						async (projectDir) => {
							await linkNodeLtsDependenciesIfNeeded(starterProject, projectDir);
							await runTsc([], { cwd: projectDir });
							await rm(join(projectDir, "src/utils"), {
								recursive: true,
							});
							await runTsc([], { cwd: projectDir });
							const treeBeforeCleanup = await readTree(projectDir);

							const cleanup = await runTscAfter(args, { cwd: projectDir });

							expect(cleanup.exitCode).toBe(0);
							expect(cleanup.stderr).toBe("");

							expect(
								await existingNodeLtsDependencies(starterProject, projectDir),
							).toStrictEqual(
								starterProject.withNodeLtsDependencies === true
									? [true, true]
									: [],
							);

							if (mode === "dry") {
								for (const file of starterProject.expectedStaleFiles) {
									expect(cleanup.stdout).toContain(
										toPlatformSep(`Would remove file: ${file}`),
									);
								}

								expect(await readTree(projectDir)).toStrictEqual(
									treeBeforeCleanup,
								);

								return;
							}

							const treeAfterCleanup = await readTree(projectDir);
							const emittedFiles = await listEmittedFiles(projectDir);
							const outDirFiles = Object.keys(
								await readTree(join(projectDir, "dist")),
							)
								.map((file) => `dist/${file}`)
								.sort();

							expect(outDirFiles).toStrictEqual(emittedFiles);
							expect(await pathExists(join(projectDir, "dist/utils"))).toBe(
								false,
							);
							await expect(
								Promise.all(
									starterProject.expectedStaleFiles.map((file) =>
										pathExists(join(projectDir, file)),
									),
								),
							).resolves.toStrictEqual(
								starterProject.expectedStaleFiles.map(() => false),
							);
							expect(treeOutsideOutDir(treeAfterCleanup)).toStrictEqual(
								treeOutsideOutDir(treeBeforeCleanup),
							);

							const secondCleanup = await runTscAfter([], {
								cwd: projectDir,
							});

							expect(secondCleanup.exitCode).toBe(0);
							expect(secondCleanup.stderr).toBe("");
							expect(await readTree(projectDir)).toStrictEqual(
								treeAfterCleanup,
							);
						},
						{ fixtureDir: starterProject.fixtureDir },
					);
				},
			);
		},
	);
});

async function existingNodeLtsDependencies(
	starterProject: StarterProject,
	projectDir: string,
): Promise<boolean[]> {
	if (starterProject.withNodeLtsDependencies !== true) {
		return [];
	}

	return Promise.all(
		nodeLtsDependencies.map((packageName) =>
			pathExists(join(projectDir, "node_modules", packageName)),
		),
	);
}

async function linkNodeLtsDependenciesIfNeeded(
	starterProject: StarterProject,
	projectDir: string,
): Promise<void> {
	if (starterProject.withNodeLtsDependencies !== true) {
		return;
	}

	for (const packageName of nodeLtsDependencies) {
		const packageDir = dirname(require.resolve(`${packageName}/package.json`));
		const linkPath = join(projectDir, "node_modules", packageName);
		await mkdir(dirname(linkPath), { recursive: true });
		await symlink(packageDir, linkPath, "dir");
	}
}

function treeOutsideOutDir(
	tree: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(tree).filter(
			([file]) => file !== "dist" && !file.startsWith("dist/"),
		),
	);
}
