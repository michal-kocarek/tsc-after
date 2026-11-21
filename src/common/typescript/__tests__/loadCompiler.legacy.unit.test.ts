import { describe, it, vi } from "vitest";

vi.mock(import("typescript"), async (importOriginal) => {
	const ts = await importOriginal();

	return { ...ts, default: { ...ts.default, version: "3.8.3" } };
});

import { UserError } from "../../errors.ts";
import { loadCompiler } from "../loadCompiler.ts";

describe(loadCompiler, () => {
	it("rejects TypeScript 3.8 and earlier", async ({ expect }) => {
		const result = loadCompiler();

		await expect(result).rejects.toBeInstanceOf(UserError);
		await expect(result).rejects.toThrow(
			"TypeScript 3.8 and earlier are not supported. Use TypeScript 3.9 or later.",
		);
	});
});
