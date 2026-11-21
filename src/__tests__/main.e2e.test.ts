import { describe, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import { runTscAfter } from "./project.ts";

// Sanity check as this needs full build
try {
	require.resolve("../../dist/tscAfter.js");
} catch (e) {
	throw new Error("dist entry point not found", { cause: e });
}

describe("package.json", () => {
	it("has expected bin", ({ expect }) => {
		expect(packageJson.bin).toStrictEqual({
			"tsc-after": "bin/tsc-after.js",
		});
	});

	it("does not export anything", ({ expect }) => {
		expect(packageJson.exports).toBeNull();
	});
});

describe("tsc-after", () => {
	it("should print help", async ({ expect }) => {
		const result = await runTscAfter(["--help"]);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toMatchSnapshot();
	});

	it("should print version", async ({ expect }) => {
		const result = await runTscAfter(["--version"]);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toMatch(
			/^tsc-after\/\d+\.\d+\.\d+ [\w\-.]+ [\w\-.]+ [\w\-.]+$/v,
		);
	});

	it("should fail nicely when called with unknown argument", async ({
		expect,
	}) => {
		const result = await runTscAfter(["--unknown"], {
			allowFailure: true,
		});

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toBe("error: Unknown option '--unknown'.");
		expect(result.stdout).toBe("");
	});

	it("should reject invalid boolean values with exit code 2", async ({
		expect,
	}) => {
		const result = await runTscAfter(["--dry=yes"], {
			allowFailure: true,
		});

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toBe(
			"error: Option '-d, --dry' does not take an argument.",
		);
		expect(result.stdout).toBe("");
	});

	it("should parse arguments before handling help", async ({ expect }) => {
		const result = await runTscAfter(["--help", "--unknown"], {
			allowFailure: true,
		});

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toBe("error: Unknown option '--unknown'.");
		expect(result.stdout).toBe("");
	});

	it("should fail nicely when called with positional argument", async ({
		expect,
	}) => {
		const result = await runTscAfter(["tsconfig.json"], {
			allowFailure: true,
		});

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toBe(
			"error: Unexpected argument 'tsconfig.json'. This command does not take positional arguments.",
		);
		expect(result.stdout).toBe("");
	});

	it("should fail nicely when called with option missing its value", async ({
		expect,
	}) => {
		const result = await runTscAfter(["--project"], {
			allowFailure: true,
		});

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toBe(
			"error: Option '-p, --project <value>' argument missing.",
		);
		expect(result.stdout).toBe("");
	});
});
