import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, onTestFinished } from "vitest";

import { UserError } from "../../errors.ts";
import { TypeScript7Compiler } from "../typescript7Compiler.ts";
import { TYPESCRIPT_7_1, typescriptVersion } from "../version.ts";

describe.runIf(typescriptVersion >= TYPESCRIPT_7_1)(TypeScript7Compiler, () => {
	it("parses project files and inherited config paths", async ({ expect }) => {
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
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		const compiler = await createCompiler();

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

	it("records watch options from the config chain", async ({ expect }) => {
		const projectDir = createTempProject({
			"base.json": JSON.stringify({
				compilerOptions: { outDir: "dist" },
				watchOptions: { watchFile: "useFsEvents" },
			}),
			"src/index.ts": "export const value = 1;",
			"tsconfig.json": JSON.stringify({
				extends: "./base.json",
			}),
		});
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		const compiler = await createCompiler();

		const project = compiler.parseProject(
			path.join(projectDir, "tsconfig.json"),
		);

		expect(project.hasWatchOptions).toBe(true);
	});

	it("returns JavaScript, declaration, and map output paths", async ({
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
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		const compiler = await createCompiler();

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

	it("converts config diagnostics into a UserError", async ({ expect }) => {
		const projectDir = createTempProject({
			"src/index.ts": "export const value = 1;",
			"tsconfig.json": JSON.stringify({
				compilerOptions: { anInvalidOption: true },
			}),
		});
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		const compiler = await createCompiler();

		expect(() =>
			compiler.parseProject(path.join(projectDir, "tsconfig.json")),
		).toThrow(UserError);
	});

	it("derives output paths when noEmitOnError is enabled", async ({
		expect,
	}) => {
		const projectDir = createTempProject({
			"src/index.ts": "export const value: number = 'invalid';",
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					noEmitOnError: true,
					outDir: "dist",
					rootDir: "src",
				},
			}),
		});
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		const compiler = await createCompiler();
		const project = compiler.parseProject(
			path.join(projectDir, "tsconfig.json"),
		);

		expect(compiler.getOutputPaths(project)).toStrictEqual(
			new Set([path.join(projectDir, "dist/index.js")]),
		);
	});

	it("reports TS5083 when a config file is missing", async ({ expect }) => {
		const compiler = await createCompiler();

		expect(() =>
			compiler.parseProject(path.join(os.tmpdir(), "missing-tsconfig.json")),
		).toThrow("error TS5083");
	});

	it("refuses package-based extends", async ({ expect }) => {
		const projectDir = createTempProject({
			"node_modules/package-config/tsconfig.json": JSON.stringify({
				compilerOptions: { outDir: "dist" },
			}),
			"src/index.ts": "export const value = 1;",
			"tsconfig.json": JSON.stringify({
				extends: "package-config/tsconfig.json",
			}),
		});
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		const compiler = await createCompiler();

		expect(() =>
			compiler.parseProject(path.join(projectDir, "tsconfig.json")),
		).toThrow("Could not safely determine extended config");
	});

	it("uses case sensitivity detected by the API", async ({ expect }) => {
		const projectDir = createTempProject({ caseProbe: "" });
		onTestFinished(() => {
			fs.rmSync(projectDir, { force: true, recursive: true });
		});
		const compiler = await createCompiler();
		const caseInsensitivePath = path.join(projectDir, "CASEPROBE");

		expect(compiler.useCaseSensitiveFileNames).toBe(
			!fs.existsSync(caseInsensitivePath),
		);
	});

	it("closes after errors and tolerates repeated close calls", async ({
		expect,
	}) => {
		const compiler = await createCompiler();

		expect(() =>
			compiler.parseProject(path.join(os.tmpdir(), "missing-tsconfig.json")),
		).toThrow(UserError);
		expect(() => {
			compiler.close();
		}).not.toThrow();
		expect(() => {
			compiler.close();
		}).not.toThrow();
	});
});

async function createCompiler(): Promise<TypeScript7Compiler> {
	const compilerHolder: { current?: TypeScript7Compiler } = {};
	onTestFinished(() => compilerHolder.current?.close());
	const compiler = await TypeScript7Compiler.create();
	compilerHolder.current = compiler;
	return compiler;
}

function createTempProject(files: Record<string, string>): string {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsc-after-"));
	for (const [filePath, contents] of Object.entries(files)) {
		const absolutePath = path.join(projectDir, filePath);
		fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
		fs.writeFileSync(absolutePath, contents);
	}

	return projectDir;
}
