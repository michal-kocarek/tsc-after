import { describe, it, onTestFinished } from "vitest";

import type { Compiler } from "../compiler.ts";

import { loadCompiler } from "../loadCompiler.ts";
import { TypeScript5Compiler } from "../typescript5Compiler.ts";
import { TypeScript7Compiler } from "../typescript7Compiler.ts";
import { TYPESCRIPT_7_0, typescriptVersion } from "../version.ts";

describe(loadCompiler, () => {
	it("selects the adapter for the installed TypeScript version", async ({
		expect,
	}) => {
		const compilerHolder: { current?: Compiler } = {};
		onTestFinished(() => compilerHolder.current?.close());
		const compiler = await loadCompiler();
		compilerHolder.current = compiler;

		const expectedCompilerClass =
			typescriptVersion < TYPESCRIPT_7_0
				? TypeScript5Compiler
				: TypeScript7Compiler;

		expect(compiler).toBeInstanceOf(expectedCompilerClass);
	});
});
