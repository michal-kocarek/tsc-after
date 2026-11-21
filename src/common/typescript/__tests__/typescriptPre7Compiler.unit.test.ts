import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, onTestFinished } from "vitest";

import { UserError } from "../../errors.ts";
import { TypeScriptPre7Compiler } from "../typescriptPre7Compiler.ts";
import { TYPESCRIPT_7_0, typescriptVersion } from "../version.ts";

describe.runIf(typescriptVersion < TYPESCRIPT_7_0)(
	TypeScriptPre7Compiler,
	() => {
		it("parses project files and inherited config paths", ({ expect }) => {
			const projectDir = createTempProject({
				"base.json": JSON.stringify({
					compilerOptions: { outDir: "dist" },
				}),
				"src/index.ts": "export const value = 1;",
				"tsconfig.json": JSON.stringify({
					extends: "./base.json",
					include: ["src"],
				}),
			});
			const compiler = new TypeScriptPre7Compiler();
			onTestFinished(() => {
				compiler.close();
				fs.rmSync(projectDir, { force: true, recursive: true });
			});

			const configFilePath = path.join(projectDir, "tsconfig.json");
			const project = compiler.parseProject(configFilePath);

			expect(project.fileNames).toStrictEqual([
				path.join(projectDir, "src/index.ts"),
			]);
			expect(project.options.outDir).toBe(path.join(projectDir, "dist"));
			expect(project.configFilePaths).toStrictEqual([
				configFilePath,
				path.join(projectDir, "base.json"),
			]);
			expect(project.hasWatchOptions).toBe(false);
		});

		it("records watch options", ({ expect }) => {
			const projectDir = createTempProject({
				"src/index.ts": "export const value = 1;",
				"tsconfig.json": JSON.stringify({
					compilerOptions: { outDir: "dist" },
					watchOptions: { watchFile: "useFsEvents" },
				}),
			});
			const compiler = new TypeScriptPre7Compiler();
			onTestFinished(() => {
				compiler.close();
				fs.rmSync(projectDir, { force: true, recursive: true });
			});

			const project = compiler.parseProject(
				path.join(projectDir, "tsconfig.json"),
			);

			expect(project.hasWatchOptions).toBe(true);
		});

		it("returns JavaScript, declaration, and map output paths", ({
			expect,
		}) => {
			const projectDir = createTempProject({
				"src/index.ts": "export const value = 1;",
				"tsconfig.json": JSON.stringify({
					compilerOptions: {
						declaration: true,
						declarationMap: true,
						outDir: "dist",
						rootDir: "src",
						sourceMap: true,
					},
				}),
			});
			const compiler = new TypeScriptPre7Compiler();
			onTestFinished(() => {
				compiler.close();
				fs.rmSync(projectDir, { force: true, recursive: true });
			});

			const project = compiler.parseProject(
				path.join(projectDir, "tsconfig.json"),
			);

			expect(compiler.getOutputPaths(project)).toStrictEqual(
				new Set([
					path.join(projectDir, "dist/index.d.ts"),
					path.join(projectDir, "dist/index.d.ts.map"),
					path.join(projectDir, "dist/index.js"),
					path.join(projectDir, "dist/index.js.map"),
				]),
			);
		});

		it("converts config diagnostics into a UserError", ({ expect }) => {
			const projectDir = createTempProject({
				"tsconfig.json": JSON.stringify({
					compilerOptions: { anInvalidOption: true },
				}),
			});
			const compiler = new TypeScriptPre7Compiler();
			onTestFinished(() => {
				compiler.close();
				fs.rmSync(projectDir, { force: true, recursive: true });
			});

			expect(() =>
				compiler.parseProject(path.join(projectDir, "tsconfig.json")),
			).toThrow(UserError);
		});
	},
);

function createTempProject(files: Record<string, string>): string {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsc-after-"));
	for (const [filePath, contents] of Object.entries(files)) {
		const absolutePath = path.join(projectDir, filePath);
		fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
		fs.writeFileSync(absolutePath, contents);
	}

	return projectDir;
}
