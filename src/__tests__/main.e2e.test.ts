import { execa } from "execa";
import { stripVTControlCharacters } from "node:util";
import { describe, it } from "vitest";

const binPath = require.resolve("../../bin/tsc-after");

async function runTscAfter(
	args: string[],
	opts: { allowFailure: boolean } = { allowFailure: false },
) {
	const result = await execa(binPath, args, {
		env: {
			FORCE_COLOR: undefined,
			NO_COLOR: "1",
		},
		reject: !opts.allowFailure,
	});

	result.stdout = stripVTControlCharacters(result.stdout);
	result.stderr = stripVTControlCharacters(result.stderr);

	return result;
}

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

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toBe("error: Unknown option '--unknown'.");
		expect(result.stdout).toBe("");
	});

	it("should fail nicely when called with positional argument", async ({
		expect,
	}) => {
		const result = await runTscAfter(["tsconfig.json"], {
			allowFailure: true,
		});

		expect(result.exitCode).toBe(1);
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

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toBe(
			"error: Option '-p, --project <value>' argument missing.",
		);
		expect(result.stdout).toBe("");
	});
});
