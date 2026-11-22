import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, onTestFinished } from "vitest";

import { UserError } from "../../errors.ts";
import { TypeScriptPre7Compiler } from "../typescriptPre7Compiler.ts";
import {
	TYPESCRIPT_4_2,
	TYPESCRIPT_7_0,
	typescriptVersion,
} from "../version.ts";

describe.runIf(typescriptVersion < TYPESCRIPT_7_0)(
	TypeScriptPre7Compiler,
	() => {
		it("parses project files and keeps the root config path", ({ expect }) => {
			const projectDir = createTempProject({
				"base.json": JSON.stringify({
					compilerOptions: { outDir: "dist" },
				}),
				"lib/imported.ts": "export const imported = true;",
				"src/index.ts": 'import "../lib/imported";\nexport const value = 1;',
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

			expect(project.fileNames.map(path.normalize)).toStrictEqual([
				path.join(projectDir, "src/index.ts"),
			]);
			expect(project.programFileNames.map(path.normalize).sort()).toStrictEqual(
				[
					path.join(projectDir, "src/index.ts"),
					path.join(projectDir, "lib/imported.ts"),
				].sort(),
			);
			expect(path.normalize(project.options.outDir ?? "")).toBe(
				path.join(projectDir, "dist"),
			);
			expect(path.normalize(project.configFilePath)).toBe(
				path.normalize(configFilePath),
			);
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

			expect(
				new Set(
					[...compiler.getOutputPaths(project)].map((outputPath) =>
						path.normalize(outputPath),
					),
				),
			).toStrictEqual(
				new Set([
					path.join(projectDir, "dist/index.d.ts"),
					path.join(projectDir, "dist/index.d.ts.map"),
					path.join(projectDir, "dist/index.js"),
					path.join(projectDir, "dist/index.js.map"),
				]),
			);
		});

		it.runIf(typescriptVersion < TYPESCRIPT_4_2)(
			"requires rootDir on TypeScript 3.9 through 4.1",
			({ expect }) => {
				const projectDir = createTempProject({
					"src/index.ts": "export const value = 1;",
					"tsconfig.json": JSON.stringify({
						compilerOptions: { outDir: "dist" },
						files: ["src/index.ts", "types/global.d.ts"],
					}),
					"types/global.d.ts": "declare const globalValue: string;",
				});
				const compiler = new TypeScriptPre7Compiler();
				onTestFinished(() => {
					compiler.close();
					fs.rmSync(projectDir, { force: true, recursive: true });
				});

				const project = compiler.parseProject(
					path.join(projectDir, "tsconfig.json"),
				);

				expect(() => compiler.getOutputPaths(project)).toThrow(
					"Refusing to clean outDir: TypeScript 3.9 through 4.1 require rootDir to be set.",
				);
			},
		);

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
