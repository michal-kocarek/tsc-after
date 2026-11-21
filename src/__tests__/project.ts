import type { TestContext } from "vitest";

import { execa } from "execa";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const e2eDir = resolve(repositoryRoot, ".tmp/e2e");

const require = createRequire(import.meta.url);
const simpleFixtureDir = resolve(
	repositoryRoot,
	"src/__tests__/fixtures/simple",
);
const tscPath = require.resolve("typescript/bin/tsc");
const tscAfterPath = resolve(repositoryRoot, "bin/tsc-after.js");

interface ProjectOptions {
	fixtureDir?: string;
	prefix?: string;
}

interface RunOptions {
	allowFailure?: boolean;
	cwd?: string;
}

export function runTsc(args: string[], opts: RunOptions = {}) {
	return execa(tscPath, args, {
		...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
		reject: !(opts.allowFailure ?? false),
	});
}

export async function runTscAfter(args: string[], opts: RunOptions = {}) {
	const nodeExecutable =
		// eslint-disable-next-line n/no-process-env -- CLI runtime override.
		process.env["TSC_AFTER_NODE_EXECUTABLE"] ?? process.execPath;
	const result = await execa(nodeExecutable, [tscAfterPath, ...args], {
		...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
		env: {
			FORCE_COLOR: undefined,
			NO_COLOR: "1",
		},
		reject: !(opts.allowFailure ?? false),
	});

	result.stdout = stripVTControlCharacters(result.stdout);
	result.stderr = stripVTControlCharacters(result.stderr);

	return result;
}

export async function withProject<T>(
	task: TestContext["task"],
	callback: (projectDir: string) => Promise<T> | T,
	options: ProjectOptions = {},
): Promise<T> {
	const fullName = task.fullTestName.toLowerCase();

	const folderPrefix = [
		Math.round(Date.now() / 1000).toString(16),
		(fullName.length > 80
			? `${fullName.substring(0, 30)}_${fullName.substring(fullName.length - 49)}`
			: fullName
		)
			.replaceAll(/[^0-9_a-z]/gv, " ")
			.trim()
			.replaceAll(/\s+/gv, "-"),

		"",
	].join("-");

	await mkdir(e2eDir, { recursive: true });

	const projectDir = await mkdtemp(
		join(e2eDir, options.prefix ?? folderPrefix),
	);

	await cp(options.fixtureDir ?? simpleFixtureDir, projectDir, {
		recursive: true,
	});

	return callback(projectDir);
}
