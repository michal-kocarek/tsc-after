import {
	mkdir,
	readFile,
	stat,
	symlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";

import {
	cliOutcome,
	ISOLATED_COMPILER_OPTIONS,
	listEmittedFiles,
	pathExists,
	readTree,
	runTsc,
	runTscAfter,
	toPlatformSep,
	withCleanModes,
	withProject,
	writeJson,
} from "./project.ts";

describe("copy", () => {
	it.for(withCleanModes([{ name: "copy with cleanup" }]))(
		"copies a file while cleaning stale outputs ($mode)",
		async ({ args, mode }, { expect, task }) => {
			await withProject(task, async (projectDir) => {
				await runTsc([], { cwd: projectDir });
				await writeJson(projectDir, "src/schema.json", { version: 1 });
				await writeFile(join(projectDir, "dist/stale.js"), "stale");

				const cleanup = await runTscAfter(
					[...args, "--copy", "src/schema.json:assets/schema.json"],
					{ cwd: projectDir },
				);

				expect(cleanup.exitCode).toBe(0);
				expect(cleanup.stdout.split("\n")).toStrictEqual(
					(mode === "dry"
						? [
								"Using tsconfig: tsconfig.json",
								"Would remove file: dist/stale.js",
								"Would copy file: src/schema.json -> dist/assets/schema.json",
								"Would copy 1 file and remove 1 file from dist",
							]
						: [
								"Using tsconfig: tsconfig.json",
								"tsc-after: Copied 1 file and removed 1 file from dist",
							]
					).map(toPlatformSep),
				);

				if (mode === "dry") {
					await expect(
						readFile(join(projectDir, "dist/stale.js"), "utf8"),
					).resolves.toBe("stale");
					await expect(
						pathExists(join(projectDir, "dist/assets/schema.json")),
					).resolves.toBe(false);
				} else {
					await expect(
						pathExists(join(projectDir, "dist/stale.js")),
					).resolves.toBe(false);
					await expect(
						readFile(join(projectDir, "dist/assets/schema.json"), "utf8"),
					).resolves.toBe('{"version":1}');
				}
			});
		},
	);

	it("skips an up-to-date copy without changing its modification time", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await runTscAfter(["--copy", "src/schema.json:schema.json"], {
				cwd: projectDir,
			});

			const destinationPath = join(projectDir, "dist/schema.json");
			const oldTime = new Date("2000-01-01T00:00:00.000Z");
			await utimes(destinationPath, oldTime, oldTime);
			const before = await stat(destinationPath);
			const secondRun = await runTscAfter(
				["--verbose", "--copy", "src/schema.json:schema.json"],
				{ cwd: projectDir },
			);
			const after = await stat(destinationPath);

			expect(secondRun.stdout).toContain(
				toPlatformSep(
					"Skipped (up to date): src/schema.json -> dist/schema.json",
				),
			);
			expect(after.mtimeMs).toBe(before.mtimeMs);
		});
	});

	it("removes a previous destination after its copy entry is dropped", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await runTscAfter(["--copy", "src/schema.json:schema.json"], {
				cwd: projectDir,
			});

			const cleanup = await runTscAfter([], { cwd: projectDir });

			expect(cleanup.stdout).toContain("tsc-after: Removed 1 file from dist");
			await expect(
				pathExists(join(projectDir, "dist/schema.json")),
			).resolves.toBe(false);
		});
	});

	it("keeps a dropped destination when cleaning is disabled", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await writeJson(projectDir, "src/other.json", { version: 2 });
			await runTscAfter(["--copy", "src/schema.json:schema.json"], {
				cwd: projectDir,
			});

			await runTscAfter(["--noClean", "--copy", "src/other.json:other.json"], {
				cwd: projectDir,
			});

			await expect(
				readFile(join(projectDir, "dist/schema.json"), "utf8"),
			).resolves.toBe('{"version":1}');
			await expect(
				readFile(join(projectDir, "dist/other.json"), "utf8"),
			).resolves.toBe('{"version":2}');
		});
	});

	it("copies without removing stale outputs with --noClean", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await writeFile(join(projectDir, "dist/stale.js"), "stale");

			const cleanup = await runTscAfter(
				["--noClean", "--copy", "src/schema.json:schema.json"],
				{ cwd: projectDir },
			);

			expect(cleanup.stdout.split("\n")).toStrictEqual([
				"Using tsconfig: tsconfig.json",
				"Copied 1 file to dist",
			]);
			await expect(
				readFile(join(projectDir, "dist/stale.js"), "utf8"),
			).resolves.toBe("stale");
			await expect(
				readFile(join(projectDir, "dist/schema.json"), "utf8"),
			).resolves.toBe('{"version":1}');
		});
	});

	it("lists copied and up-to-date files in verbose output", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await writeJson(projectDir, "src/other.json", { version: 2 });
			const existingDestination = join(projectDir, "dist/assets/schema.json");
			await mkdir(dirname(existingDestination), { recursive: true });
			await writeJson(projectDir, "dist/assets/schema.json", { version: 1 });

			const cleanup = await runTscAfter(
				[
					"--verbose",
					"--copy",
					"src/schema.json:assets/schema.json",
					"--copy",
					"src/other.json:assets/other.json",
				],
				{ cwd: projectDir },
			);

			expect(cleanup.stdout).toContain(
				toPlatformSep("Copied file: src/other.json -> dist/assets/other.json"),
			);
			expect(cleanup.stdout).toContain(
				toPlatformSep(
					"Skipped (up to date): src/schema.json -> dist/assets/schema.json",
				),
			);
		});
	});

	it("refuses a destination that is a resolveJsonModule output", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await writeFile(
				join(projectDir, "src/lib.ts"),
				'import schema from "./schema.json";\nexport default schema;',
			);
			await writeJson(projectDir, "tsconfig.json", {
				compilerOptions: {
					...ISOLATED_COMPILER_OPTIONS,
					esModuleInterop: true,
					module: "commonjs",
					moduleResolution: "node",
					outDir: "dist",
					resolveJsonModule: true,
					rootDir: "src",
				},
			});

			await expect(listEmittedFiles(projectDir)).resolves.toContain(
				"dist/schema.json",
			);

			const before = await readTree(projectDir);

			const result = await runTscAfter(
				["--copy", "src/schema.json:schema.json"],
				{ allowFailure: true, cwd: projectDir },
			);

			expect(cliOutcome(result)).toStrictEqual({
				exitCode: 1,
				hasStackTrace: false,
				stderr: toPlatformSep(
					"error: Refusing to copy to 'dist/schema.json': it is an output of the project.",
				),
			});
			await expect(readTree(projectDir)).resolves.toStrictEqual(before);
		});
	});

	it("refuses a source inside declarationDir", async ({ expect, task }) => {
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
			const before = await readTree(projectDir);

			const result = await runTscAfter(
				["--copy", "types/lib.d.ts:schema.d.ts"],
				{ allowFailure: true, cwd: projectDir },
			);

			expect(cliOutcome(result)).toStrictEqual({
				exitCode: 1,
				hasStackTrace: false,
				stderr:
					"error: Refusing to copy 'types/lib.d.ts': it is inside declarationDir 'types'.",
			});
			await expect(readTree(projectDir)).resolves.toStrictEqual(before);
		});
	});

	it("refuses a destination reached through a symbolic link", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			const targetDir = join(projectDir, "outside");
			const linkPath = join(projectDir, "dist/assets");
			await mkdir(targetDir);
			await symlink(targetDir, linkPath, "junction");
			const before = await readTree(projectDir);

			const result = await runTscAfter(
				["--copy", "src/schema.json:assets/schema.json"],
				{ allowFailure: true, cwd: projectDir },
			);

			expect(cliOutcome(result)).toStrictEqual({
				exitCode: 1,
				hasStackTrace: false,
				stderr: toPlatformSep(
					"error: Refusing to copy to 'dist/assets/schema.json': path component 'dist/assets' is a symbolic link.",
				),
			});
			await expect(readTree(projectDir)).resolves.toStrictEqual(before);
		});
	});

	it("applies noEmit refusals on copy-only runs", async ({ expect, task }) => {
		await withProject(task, async (projectDir) => {
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await writeJson(projectDir, "tsconfig.json", {
				compilerOptions: {
					...ISOLATED_COMPILER_OPTIONS,
					noEmit: true,
					outDir: "dist",
					rootDir: "src",
				},
			});
			const before = await readTree(projectDir);

			const result = await runTscAfter(
				["--noClean", "--copy", "src/schema.json:schema.json"],
				{ allowFailure: true, cwd: projectDir },
			);

			expect(cliOutcome(result)).toMatchObject({
				exitCode: 1,
				hasStackTrace: false,
				stderr: expect.stringContaining(
					"Refusing to clean outDir because noEmit is enabled.",
				),
			});
			await expect(readTree(projectDir)).resolves.toStrictEqual(before);
		});
	});

	it("applies cleanup-root refusals on copy-only runs", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await writeJson(projectDir, "src/schema.json", { version: 1 });
			await writeJson(projectDir, "tsconfig.json", {
				compilerOptions: {
					...ISOLATED_COMPILER_OPTIONS,
					outDir: "linked/dist",
					rootDir: "src",
				},
			});
			const targetDir = join(projectDir, "actual-outDir");
			await mkdir(targetDir);
			await symlink(targetDir, join(projectDir, "linked"), "junction");
			const before = await readTree(projectDir);

			const result = await runTscAfter(
				["--noClean", "--copy", "src/schema.json:schema.json"],
				{ allowFailure: true, cwd: projectDir },
			);

			expect(cliOutcome(result)).toMatchObject({
				exitCode: 1,
				hasStackTrace: false,
				stderr: expect.stringContaining(
					toPlatformSep(
						"Refusing to clean outDir through a symbolic link: linked/dist!",
					),
				),
			});
			await expect(readTree(projectDir)).resolves.toStrictEqual(before);
		});
	});
});
