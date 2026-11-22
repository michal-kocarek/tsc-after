import path from "node:path";
import { describe, it } from "vitest";

import { isPathInside, normalizedAncestorDirPaths } from "../paths.ts";

describe(isPathInside, () => {
	it("returns true for equal paths", ({ expect }) => {
		const dirPath = "project/dist";

		expect(isPathInside(dirPath, dirPath, true)).toBe(true);
	});

	it("returns true for a child path", ({ expect }) => {
		const dirPath = "project/dist";

		expect(isPathInside(dirPath, `${dirPath}/index.js`, true)).toBe(true);
	});

	it("returns false for a sibling with a shared prefix", ({ expect }) => {
		expect(isPathInside("project/dist", "project/dist2/index.js", true)).toBe(
			false,
		);
	});

	it("returns false for a parent path", ({ expect }) => {
		expect(isPathInside("project/dist", "project", true)).toBe(false);
	});

	it("supports relative paths", ({ expect }) => {
		expect(isPathInside("project/dist", "project/dist/index.js", true)).toBe(
			true,
		);
	});

	it("uses case-sensitive paths when requested", ({ expect }) => {
		expect(isPathInside("Project/dist", "project/dist/index.js", true)).toBe(
			false,
		);
	});

	it("uses case-insensitive paths when requested", ({ expect }) => {
		expect(isPathInside("Project/dist", "project/dist/index.js", false)).toBe(
			true,
		);
	});

	it("normalizes paths before checking containment", ({ expect }) => {
		expect(
			isPathInside("project/dist/.", "project/dist/nested/../index.js", true),
		).toBe(true);
	});
});

describe(normalizedAncestorDirPaths, () => {
	it("returns parent directories up to and including the root", ({
		expect,
	}) => {
		const rootPath = path.resolve("project/dist");
		const filePath = path.join(rootPath, "assets/schema.json");

		expect(normalizedAncestorDirPaths(filePath, rootPath, true)).toStrictEqual([
			path.join(rootPath, "assets"),
			rootPath,
		]);
	});

	it("stops at the filesystem root", ({ expect }) => {
		const rootPath = path.parse(process.cwd()).root;
		const filePath = path.join(rootPath, "project/assets/schema.json");

		expect(normalizedAncestorDirPaths(filePath, rootPath, true)).toStrictEqual([
			path.join(rootPath, "project", "assets"),
			path.join(rootPath, "project"),
			rootPath,
		]);
	});
});
