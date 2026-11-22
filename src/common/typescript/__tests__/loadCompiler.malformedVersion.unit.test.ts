import { describe, it, vi } from "vitest";

vi.mock(import("typescript"), async (importOriginal) => {
	const ts = await importOriginal();

	return { ...ts, default: { ...ts.default, version: "not-a-version" } };
});

import { UserError } from "../../errors.ts";
import { loadCompiler } from "../loadCompiler.ts";

describe(loadCompiler, () => {
	it("rejects a TypeScript version it cannot parse", async ({ expect }) => {
		const result = loadCompiler();

		await expect(result).rejects.toBeInstanceOf(UserError);
		await expect(result).rejects.toThrow(
			"Cannot parse TypeScript version 'not-a-version'.",
		);
	});
});
