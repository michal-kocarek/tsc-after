import type { Compiler } from "./compiler.ts";

import { UserError } from "../errors.ts";
import {
	TYPESCRIPT_7_0,
	TYPESCRIPT_7_1,
	typescriptVersion,
} from "./version.ts";

interface TypeScript7CompilerModule {
	TypeScript7Compiler: { create(): Promise<Compiler> };
}

export async function loadCompiler(): Promise<Compiler> {
	if (typescriptVersion < TYPESCRIPT_7_0) {
		const { TypeScript5Compiler } = await import("./typescript5Compiler.ts");
		return new TypeScript5Compiler();
	}

	if (typescriptVersion < TYPESCRIPT_7_1) {
		throw new UserError(
			"TypeScript 7.0 is not supported. Use TypeScript 7.1 or later.",
		);
	}

	const compilerModule =
		(await import("./typescript7Compiler.ts")) as unknown as TypeScript7CompilerModule;
	return compilerModule.TypeScript7Compiler.create();
}
