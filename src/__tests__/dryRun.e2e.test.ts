import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "vitest";

import {
	pathExists,
	readTree,
	runTsc,
	runTscAfter,
	withProject,
} from "./project.ts";

describe("dry run and cleanup output", () => {
	it("lists planned files and empty directories without changing them", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			const emptyDir = join(projectDir, "dist/empty");
			const nestedStaleFile = join(projectDir, "dist/old/nested/stale.js");
			const staleFile = join(projectDir, "dist/stale.js");

			await runTsc([], { cwd: projectDir });
			await mkdir(emptyDir);
			await mkdir(join(projectDir, "dist/old/nested"), { recursive: true });
			await writeFile(nestedStaleFile, "stale");
			await writeFile(staleFile, "stale");
			const treeBeforeCleanup = await readTree(projectDir);

			const cleanup = await runTscAfter(["--dry"], { cwd: projectDir });

			expect(cleanup.exitCode).toBe(0);
			expect(cleanup.stderr).toBe("");
			expect(cleanup.stdout.split("\n")).toStrictEqual([
				"Using tsconfig: tsconfig.json",
				"Would remove empty directory: dist/empty",
				"Would remove file: dist/old/nested/stale.js",
				"Would remove empty directory: dist/old/nested",
				"Would remove empty directory: dist/old",
				"Would remove file: dist/stale.js",
				"tsc-after: Would remove 2 files and 3 empty directories from dist",
			]);
			await expect(readTree(projectDir)).resolves.toStrictEqual(
				treeBeforeCleanup,
			);
			await expect(
				Promise.all([
					pathExists(emptyDir),
					pathExists(join(projectDir, "dist/old/nested")),
					pathExists(join(projectDir, "dist/old")),
					pathExists(nestedStaleFile),
					pathExists(staleFile),
				]),
			).resolves.toStrictEqual([true, true, true, true, true]);
		});
	});

	it("reports when a dry run has nothing to remove", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			const treeBeforeCleanup = await readTree(projectDir);

			const cleanup = await runTscAfter(["--dry"], { cwd: projectDir });

			expect(cleanup.exitCode).toBe(0);
			expect(cleanup.stderr).toBe("");
			expect(cleanup.stdout.split("\n")).toStrictEqual([
				"Using tsconfig: tsconfig.json",
				"tsc-after: Nothing to remove from dist",
			]);
			await expect(readTree(projectDir)).resolves.toStrictEqual(
				treeBeforeCleanup,
			);
		});
	});

	it("shows skipped entries in a verbose dry run without changing files", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			await runTsc([], { cwd: projectDir });
			const treeBeforeCleanup = await readTree(projectDir);

			const cleanup = await runTscAfter(["--dry", "--verbose"], {
				cwd: projectDir,
			});

			expect(cleanup.exitCode).toBe(0);
			expect(cleanup.stderr).toBe("");
			expect(cleanup.stdout.split("\n")).toStrictEqual([
				"Using tsconfig: tsconfig.json",
				"Skipped (expected output file): dist/index.js",
				"Skipped (expected output file): dist/lib.js",
				"Skipped (directory not empty): dist",
				"tsc-after: Nothing to remove from dist",
			]);
			await expect(readTree(projectDir)).resolves.toStrictEqual(
				treeBeforeCleanup,
			);
		});
	});

	it("prints only the summary for a normal cleanup", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			const staleFile = join(projectDir, "dist/stale.js");

			await runTsc([], { cwd: projectDir });
			await writeFile(staleFile, "stale");

			const cleanup = await runTscAfter([], { cwd: projectDir });

			expect(cleanup.exitCode).toBe(0);
			expect(cleanup.stderr).toBe("");
			expect(cleanup.stdout.split("\n")).toStrictEqual([
				"Using tsconfig: tsconfig.json",
				"tsc-after: Removed 1 file from dist",
			]);
			await expect(pathExists(staleFile)).resolves.toBe(false);
		});
	});

	it("prints removed and skipped entries in a verbose normal cleanup", async ({
		expect,
		task,
	}) => {
		await withProject(task, async (projectDir) => {
			const emptyDir = join(projectDir, "dist/empty");
			const staleFile = join(projectDir, "dist/old/stale.js");

			await runTsc([], { cwd: projectDir });
			await mkdir(emptyDir);
			await mkdir(join(projectDir, "dist/old"));
			await writeFile(staleFile, "stale");

			const cleanup = await runTscAfter(["--verbose"], {
				cwd: projectDir,
			});

			expect(cleanup.exitCode).toBe(0);
			expect(cleanup.stderr).toBe("");
			expect(cleanup.stdout.split("\n")).toStrictEqual([
				"Using tsconfig: tsconfig.json",
				"Removed empty directory: dist/empty",
				"Skipped (expected output file): dist/index.js",
				"Skipped (expected output file): dist/lib.js",
				"Removed file: dist/old/stale.js",
				"Removed empty directory: dist/old",
				"Skipped (directory not empty): dist",
				"tsc-after: Removed 1 file and 2 empty directories from dist",
			]);
			await expect(pathExists(emptyDir)).resolves.toBe(false);
			await expect(pathExists(join(projectDir, "dist/old"))).resolves.toBe(
				false,
			);
			await expect(pathExists(staleFile)).resolves.toBe(false);
		});
	});
});
