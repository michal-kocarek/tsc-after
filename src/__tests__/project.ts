import type { TestContext } from "vitest";

import { execa } from "execa";
import {
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	readlink,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const e2eDir = resolve(repositoryRoot, ".tmp/e2e");
export const SOURCE_FILE = "src/lib.ts";

const STACK_TRACE_MARKER = "    at ";

export const CLEAN_MODES = [
	{ args: [], mode: "normal" },
	{ args: ["--dry"], mode: "dry" },
] as const;

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

export function cliOutcome(result: { exitCode?: number; stderr: string }): {
	exitCode: number | undefined;
	hasStackTrace: boolean;
	stderr: string;
} {
	return {
		exitCode: result.exitCode,
		hasStackTrace: result.stderr.includes(STACK_TRACE_MARKER),
		stderr: result.stderr,
	};
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await lstat(filePath);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

export async function readIfExists(
	filePath: string,
): Promise<string | undefined> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}

		throw error;
	}
}

export async function readTree(
	dirPath: string,
): Promise<Record<string, string>> {
	const entries = await readdir(dirPath, {
		recursive: true,
		withFileTypes: true,
	});
	const tree: Record<string, string> = {};

	for (const entry of entries) {
		const filePath = join(entry.parentPath, entry.name);
		const relativePath = relative(dirPath, filePath).split(sep).join("/");

		if (entry.isSymbolicLink()) {
			tree[relativePath] = `symlink:${await readlink(filePath)}`;
		} else if (entry.isFile()) {
			tree[relativePath] = await readFile(filePath, "utf8");
		}
	}

	return tree;
}

export function runTsc(args: readonly string[], opts: RunOptions = {}) {
	return execa(tscPath, args, {
		...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
		reject: !(opts.allowFailure ?? false),
	});
}

export async function runTscAfter(
	args: readonly string[],
	opts: RunOptions = {},
) {
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

export function withCleanModes<T extends object>(
	rows: readonly T[],
): ((typeof CLEAN_MODES)[number] & T)[] {
	return rows.flatMap((row) =>
		CLEAN_MODES.map((cleanMode) => ({ ...row, ...cleanMode })),
	);
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

export async function writeJson(
	projectDir: string,
	relativePath: string,
	value: unknown,
): Promise<void> {
	const filePath = join(projectDir, relativePath);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(value));
}
