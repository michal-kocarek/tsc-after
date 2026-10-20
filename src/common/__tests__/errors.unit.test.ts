import { describe, it } from "vitest";

import { isNodeErrorOf } from "../errors.ts";

describe(isNodeErrorOf, () => {
	it("should return true for expected instance", ({ expect }) => {
		const error = new Error("Test error");

		expect(isNodeErrorOf(error, Error)).toBe(true);
	});

	it("should return false for unexpected value", ({ expect }) => {
		const error = "weird value";

		expect(isNodeErrorOf(error, Error)).toBe(false);
	});

	it("should return true for NodeJS errors with expected code", ({
		expect,
	}) => {
		const error = new TypeError("Test error");
		(error as unknown as Record<string, string>)["code"] = "TEST";

		expect(isNodeErrorOf(error, Error, "TEST")).toBe(true);
	});

	it("should return false for unexpected code", ({ expect }) => {
		const error = new TypeError("Test error");
		(error as unknown as Record<string, string>)["code"] = "TEST";

		expect(isNodeErrorOf(error, Error, "UNEXPECTED")).toBe(false);
	});
});
