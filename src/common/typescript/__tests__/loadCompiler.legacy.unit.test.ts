import { describe, it, vi } from "vitest";

vi.mock(import("typescript"), async (importOriginal) => {
	const ts = await importOriginal();

	return { ...ts, default: { ...ts.default, version: "4.1.6" } };
});

import { UserError } from "../../errors.ts";
import { loadCompiler } from "../loadCompiler.ts";

describe(loadCompiler, () => {
	it("rejects TypeScript 4.1 and earlier", async ({ expect }) => {
		const result = loadCompiler();

		await expect(result).rejects.toBeInstanceOf(UserError);
		await expect(result).rejects.toThrow(
			"TypeScript 4.1 and earlier are not supported. Use TypeScript 4.2 or later.",
		);
	});
});
