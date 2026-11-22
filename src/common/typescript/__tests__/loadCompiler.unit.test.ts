import { describe, it } from "vitest";

import { loadCompiler } from "../loadCompiler.ts";
import { TypeScript7Compiler } from "../typescript7Compiler.ts";
import { TypeScriptPre7Compiler } from "../typescriptPre7Compiler.ts";
import { TYPESCRIPT_7_0, typescriptVersion } from "../version.ts";

describe(loadCompiler, () => {
	it("selects the adapter for the installed TypeScript version", async ({
		expect,
		onTestFinished,
	}) => {
		const compiler = await loadCompiler();
		onTestFinished(() => {
			compiler.close();
		});

		const expectedCompilerClass =
			typescriptVersion < TYPESCRIPT_7_0
				? TypeScriptPre7Compiler
				: TypeScript7Compiler;

		expect(compiler).toBeInstanceOf(expectedCompilerClass);
	});
});
