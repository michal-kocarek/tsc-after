import { describe, it, vi } from "vitest";

vi.mock(import("typescript"), async (importOriginal) => {
	const ts = await importOriginal();

	return {
		...ts,
		default: { ...ts.default, version: "6.7.8" },
	};
});

vi.mock(import("../../../package.json"), async (importOriginal) => {
	const packageJson = await importOriginal();

	return { default: { ...packageJson.default, version: "1.2.3" } };
});

import { version } from "../version.ts";

describe(version, () => {
	it("should print version", ({ expect }) => {
		vi.stubGlobal("process", {
			...process,
			arch: "x64",
			platform: "linux",
			versions: { ...process.versions, node: "22.0.0" },
		});

		try {
			using log = vi.spyOn(console, "log").mockReturnValue();

			version();

			expect(log).toHaveBeenCalledExactlyOnceWith(expect.any(String));

			const output = (log.mock.calls[0] ?? []).join("");

			expect(output).toBe(
				"tsc-after/1.2.3 linux-x64 node-22.0.0 typescript-6.7.8",
			);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
