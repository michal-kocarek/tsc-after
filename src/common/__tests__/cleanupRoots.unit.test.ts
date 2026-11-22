import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, vi } from "vitest";

import type { Project } from "../typescript/compiler.ts";

import {
	type CleanupRoot,
	readCleanupRoot,
	resolveCleanupRoots,
} from "../cleanupRoots.ts";
import { UserError } from "../errors.ts";

describe(resolveCleanupRoots, () => {
	it("refuses roots outside cwd or containing cwd", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);

		expect(() =>
			resolveCleanupRoots(
				createProject({ outDir: "../outside" }),
				projectDir,
				true,
			),
		).toThrow(UserError);
		expect(() =>
			resolveCleanupRoots(createProject({ outDir: "." }), projectDir, true),
		).toThrow(UserError);
	});

	it("refuses a root that contains a source file", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = path.join(projectDir, "dist/index.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export {};");

		expect(() =>
			resolveCleanupRoots(
				createProject({ outDir: "dist" }, [sourcePath]),
				projectDir,
				true,
			),
		).toThrow(`contains source file '${path.join("dist", "index.ts")}'`);
	});

	it("refuses a source whose real path is inside the root", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outDir = path.join(projectDir, "dist");
		const sourcePath = path.join(projectDir, "src/index.ts");
		fs.mkdirSync(outDir);
		fs.mkdirSync(path.dirname(sourcePath));
		fs.writeFileSync(path.join(outDir, "index.ts"), "export {};");
		fs.symlinkSync(path.join(outDir, "index.ts"), sourcePath);

		expect(() =>
			resolveCleanupRoots(
				createProject({ outDir: "dist" }, [sourcePath]),
				projectDir,
				true,
			),
		).toThrow(`contains source file '${path.join("src", "index.ts")}'`);
	});

	it("drops declarationDir when it is inside outDir", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const outDir = path.join(projectDir, "dist");

		expect(
			resolveCleanupRoots(
				createProject({
					declaration: true,
					declarationDir: path.join(outDir, "types"),
					outDir,
				}),
				projectDir,
				true,
			),
		).toStrictEqual([
			{
				name: "outDir",
				path: outDir,
				relativePath: "dist",
			},
		]);
	});

	it("refuses a root reached through a symbolic link", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const targetDir = createTempDir(onTestFinished);
		fs.symlinkSync(targetDir, path.join(projectDir, "linked"), "dir");

		expect(() =>
			resolveCleanupRoots(
				createProject({ outDir: "linked" }),
				projectDir,
				true,
			),
		).toThrow("Refusing to clean outDir through a symbolic link: linked!");
	});

	it("refuses a missing root under a symbolic link", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const targetDir = createTempDir(onTestFinished);
		fs.symlinkSync(targetDir, path.join(projectDir, "linked"), "dir");

		expect(() =>
			resolveCleanupRoots(
				createProject({ outDir: "linked/dist" }),
				projectDir,
				true,
			),
		).toThrow(
			`Refusing to clean outDir through a symbolic link: ${path.join("linked", "dist")}!`,
		);
	});

	it("refuses a dangling root symbolic link", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		fs.symlinkSync("missing", path.join(projectDir, "dist"));

		expect(() =>
			resolveCleanupRoots(createProject({ outDir: "dist" }), projectDir, true),
		).toThrow("Refusing to clean outDir through a symbolic link: dist!");
	});

	it("refuses a non-directory parent component", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		fs.writeFileSync(path.join(projectDir, "file"), "not a directory");

		expect(() =>
			resolveCleanupRoots(
				createProject({ outDir: "file/dist" }),
				projectDir,
				true,
			),
		).toThrow(
			`Refusing to clean outDir '${path.join("file", "dist")}': 'file' is not a directory.`,
		);
	});

	it("uses the lexical path when a source cannot be resolved", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const sourcePath = path.join(projectDir, "dist/missing.ts");

		expect(() =>
			resolveCleanupRoots(
				createProject({ outDir: "dist" }, [sourcePath]),
				projectDir,
				true,
			),
		).toThrow(`contains source file '${path.join("dist", "missing.ts")}'`);
	});

	it("accepts a cleanup root on another device", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const rootPath = path.join(projectDir, "dist");
		fs.mkdirSync(rootPath);
		const originalLstatSync = fs.lstatSync;
		using lstatSync = vi
			.spyOn(fs, "lstatSync")
			.mockImplementation((filePath) => {
				const stats = originalLstatSync(filePath);
				if (path.resolve(String(filePath)) === rootPath) {
					Object.defineProperty(stats, "dev", { value: stats.dev + 1 });
				}
				return stats;
			});

		expect(
			resolveCleanupRoots(createProject({ outDir: "dist" }), projectDir, true),
		).toStrictEqual([{ name: "outDir", path: rootPath, relativePath: "dist" }]);
		expect(lstatSync).toHaveBeenCalledWith(rootPath);
	});
});

describe(readCleanupRoot, () => {
	it("marks stale files and empty directories for removal", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const root = createRoot(projectDir);
		const emptyDirPath = path.join(root.path, "empty");
		const staleFilePath = path.join(root.path, "stale.js");
		fs.mkdirSync(emptyDirPath, { recursive: true });
		fs.writeFileSync(staleFilePath, "stale");

		expect(readCleanupRoot(root, new Set(), true)).toStrictEqual([
			{ path: emptyDirPath, type: "removeDir" },
			{ path: staleFilePath, type: "removeFile" },
			{ path: root.path, type: "removeDir" },
		]);
	});

	it("keeps expected outputs and symbolic links as skipped entries", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const root = createRoot(projectDir);
		const expectedPath = path.join(root.path, "current.js");
		const linkPath = path.join(root.path, "linked");
		fs.mkdirSync(root.path, { recursive: true });
		fs.writeFileSync(expectedPath, "current");
		fs.symlinkSync(expectedPath, linkPath);

		const verdicts = readCleanupRoot(root, new Set([expectedPath]), true);

		expect(verdicts).toContainEqual({
			path: expectedPath,
			reason: "expected output file",
			type: "skipped",
		});
		expect(verdicts).toContainEqual({
			path: linkPath,
			reason: "symbolic link",
			type: "skipped",
		});
		expect(verdicts).not.toContainEqual(
			expect.objectContaining({ path: expectedPath, type: "removeFile" }),
		);
	});

	it("normalizes expected output separators before comparing paths", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const root = createRoot(projectDir);
		const expectedPath = path.join(root.path, "current.js");
		fs.mkdirSync(root.path, { recursive: true });
		fs.writeFileSync(expectedPath, "current");

		const expectedPathWithForwardSlashes = expectedPath.replaceAll("\\", "/");
		const verdicts = readCleanupRoot(
			root,
			new Set([expectedPathWithForwardSlashes]),
			true,
		);

		expect(verdicts).toContainEqual({
			path: expectedPath,
			reason: "expected output file",
			type: "skipped",
		});
	});

	it("compares expected output paths case-insensitively when requested", ({
		expect,
		onTestFinished,
	}) => {
		const projectDir = createTempDir(onTestFinished);
		const root = createRoot(projectDir);
		const expectedPath = path.join(root.path, "current.js");
		fs.mkdirSync(root.path, { recursive: true });
		fs.writeFileSync(expectedPath, "current");

		const verdicts = readCleanupRoot(
			root,
			new Set([path.join(root.path, "CURRENT.js")]),
			false,
		);

		expect(verdicts).toContainEqual({
			path: expectedPath,
			reason: "expected output file",
			type: "skipped",
		});
	});

	it("returns no verdicts for a missing root", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const root = createRoot(projectDir);

		expect(readCleanupRoot(root, new Set(), true)).toStrictEqual([]);
	});

	it("skips a child folder on another device", ({ expect, onTestFinished }) => {
		const projectDir = createTempDir(onTestFinished);
		const root = createRoot(projectDir);
		const mountedDirPath = path.join(root.path, "mounted");
		const nestedFilePath = path.join(mountedDirPath, "host-file.js");
		fs.mkdirSync(mountedDirPath, { recursive: true });
		fs.writeFileSync(nestedFilePath, "keep");
		const originalLstatSync = fs.lstatSync;
		using lstatSync = vi
			.spyOn(fs, "lstatSync")
			.mockImplementation((filePath) => {
				const stats = originalLstatSync(filePath);
				if (path.resolve(String(filePath)) === mountedDirPath) {
					Object.defineProperty(stats, "dev", { value: stats.dev + 1 });
				}
				return stats;
			});

		const verdicts = readCleanupRoot(root, new Set(), true);

		expect(lstatSync).toHaveBeenCalledWith(mountedDirPath);
		expect(verdicts).toContainEqual({
			path: mountedDirPath,
			reason: "different device",
			type: "skipped",
		});
		expect(verdicts).not.toContainEqual(
			expect.objectContaining({ path: nestedFilePath }),
		);
		expect(fs.existsSync(nestedFilePath)).toBe(true);
	});
});

function createProject(
	options: Project["options"],
	programFileNames: string[] = [],
): Project {
	return {
		configFilePath: "tsconfig.json",
		fileNames: [],
		options,
		programFileNames,
	};
}

function createRoot(projectDir: string): CleanupRoot {
	const rootPath = path.join(projectDir, "dist");
	return { name: "outDir", path: rootPath, relativePath: "dist" };
}

function createTempDir(onTestFinished: (cleanup: () => void) => void): string {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsc-after-"));
	onTestFinished(() => {
		fs.rmSync(projectDir, { force: true, recursive: true });
	});
	return projectDir;
}
