import type { Compiler } from "./compiler.ts";

import { UserError } from "../errors.ts";
import {
	TYPESCRIPT_3_9,
	TYPESCRIPT_7_0,
	TYPESCRIPT_7_1,
	typescriptVersion,
} from "./version.ts";

export async function loadCompiler(): Promise<Compiler> {
	if (typescriptVersion < TYPESCRIPT_3_9) {
		throw new UserError(
			"TypeScript 3.8 and earlier are not supported. Use TypeScript 3.9 or later.",
		);
	}

	if (typescriptVersion < TYPESCRIPT_7_0) {
		const { TypeScriptPre7Compiler } =
			await import("./typescriptPre7Compiler.ts");
		return new TypeScriptPre7Compiler();
	}

	if (typescriptVersion < TYPESCRIPT_7_1) {
		throw new UserError(
			"TypeScript 7.0 is not supported. Use TypeScript 7.1 or later.",
		);
	}

	const { TypeScript7Compiler } = await import("./typescript7Compiler.ts");
	return TypeScript7Compiler.create();
}
