import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, onTestFinished, vi } from "vitest";

import { parseArgs } from "../../common/util.ts";
import { mainAction } from "../mainAction.ts";

describe(mainAction, () => {
	it("keeps a busy cleanup root after removing its stale files", async ({
		expect,
	}) => {
		const projectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "tsc-after-mount-"),
		);
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		fs.mkdirSync(path.join(projectDir, "src"));
		fs.mkdirSync(path.join(projectDir, "dist"));
		fs.writeFileSync(
			path.join(projectDir, "src/index.ts"),
			"export const value = 1;",
		);
		fs.writeFileSync(path.join(projectDir, "dist/stale.js"), "stale");
		fs.writeFileSync(
			path.join(projectDir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { outDir: "dist", rootDir: "src", types: [] },
			}),
		);
		const rootPath = path.join(projectDir, "dist");
		const originalRmdirSync = fs.rmdirSync;
		using cwd = vi.spyOn(process, "cwd").mockReturnValue(projectDir);
		using log = vi.spyOn(console, "log").mockReturnValue();
		using rmdir = vi
			.spyOn(fs, "rmdirSync")
			.mockImplementation((dirPath: fs.PathLike) => {
				if (dirPath === rootPath) {
					throw Object.assign(new Error("device or resource busy"), {
						code: "EBUSY",
					});
				}
				originalRmdirSync(dirPath);
			});

		await expect(mainAction(parseArgs(["--verbose"]))).resolves.toBeUndefined();

		expect(cwd).toHaveBeenCalledWith();
		expect(rmdir).toHaveBeenCalledWith(rootPath);
		expect(fs.existsSync(path.join(rootPath, "stale.js"))).toBe(false);
		expect(fs.existsSync(rootPath)).toBe(true);
		expect(log).toHaveBeenCalledWith("Skipped (busy directory): dist");
	});
});
