import { describe, it, vi } from "vitest";

import { parseArgs } from "../util.ts";

const originalProcess = process;

describe(parseArgs, () => {
	it("parses -p as an alias for --project", ({ expect }) => {
		const longOption = parseArgs(["--project", "custom.json"]);
		const shortOption = parseArgs(["-p", "custom.json"]);

		expect(shortOption).toStrictEqual(longOption);
		expect(shortOption.values.project).toBe("custom.json");
	});

	it("parses -h as an alias for --help", ({ expect }) => {
		const longOption = parseArgs(["--help"]);
		const shortOption = parseArgs(["-h"]);

		expect(shortOption).toStrictEqual(longOption);
		expect(shortOption.values.help).toBe(true);
	});

	it("parses -d as an alias for --dry", ({ expect }) => {
		const longOption = parseArgs(["--dry"]);
		const shortOption = parseArgs(["-d"]);

		expect(shortOption).toStrictEqual(longOption);
		expect(shortOption.values.dry).toBe(true);
	});

	it("parses repeatable --copy options", ({ expect }) => {
		const parsed = parseArgs([
			"--copy",
			"src/one.json:one.json",
			"--copy",
			"src/two.json:two.json",
		]);

		expect(parsed.values.copy).toStrictEqual([
			"src/one.json:one.json",
			"src/two.json:two.json",
		]);
		expect(parsed.copyEntries).toStrictEqual([
			{ destination: "one.json", source: "src/one.json" },
			{ destination: "two.json", source: "src/two.json" },
		]);
	});

	it("rejects --noClean without --copy", ({ expect }) => {
		const originalExitCode = originalProcess.exitCode;
		vi.stubGlobal("process", { ...originalProcess });

		expect(() => parseArgs(["--noClean"])).toThrow(
			"Option '--noClean' cannot be specified without specifying option '--copy'.",
		);
		expect(process.exitCode).toBe(2);
		expect(originalProcess.exitCode).toBe(originalExitCode);
	});

	it("rejects malformed --copy values", ({ expect }) => {
		const originalExitCode = originalProcess.exitCode;
		vi.stubGlobal("process", { ...originalProcess });

		expect(() => parseArgs(["--copy", "src/file.json"])).toThrow(
			"Option '--copy' expects '<source>:<destination>', got 'src/file.json'.",
		);
		expect(process.exitCode).toBe(2);
		expect(originalProcess.exitCode).toBe(originalExitCode);
	});

	it("sets the exit code when argument parsing fails", ({ expect }) => {
		const originalExitCode = originalProcess.exitCode;
		vi.stubGlobal("process", { ...originalProcess });

		expect(() => parseArgs(["--unknown"])).toThrow(
			"Unknown option '--unknown'.",
		);
		expect(process.exitCode).toBe(2);
		expect(originalProcess.exitCode).toBe(originalExitCode);
	});
});
