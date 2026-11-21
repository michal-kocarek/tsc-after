import { describe, it } from "vitest";

import { parseTypeScriptVersion } from "../version.ts";

describe(parseTypeScriptVersion, () => {
	it("parses a stable version", ({ expect }) => {
		expect(parseTypeScriptVersion("5.9.3")).toBe(5_009_003);
	});

	it("ignores a prerelease suffix", ({ expect }) => {
		expect(parseTypeScriptVersion("7.1.0-beta")).toBe(7_001_000);
	});

	it("orders multi-digit major versions correctly", ({ expect }) => {
		expect(parseTypeScriptVersion("10.0.0")).toBeGreaterThan(
			parseTypeScriptVersion("7.1.0"),
		);
	});

	it("returns NaN for malformed versions", ({ expect }) => {
		expect(Number.isNaN(parseTypeScriptVersion("not-a-version"))).toBe(true);
	});
});
