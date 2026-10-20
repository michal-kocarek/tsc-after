import fs from "node:fs";
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import ts from "typescript";

import packageJson from "../package.json" with { type: "json" };
import { print, printError } from "./common/console.ts";
import { cliArgsOptions } from "./common/constants.ts";
import { isNodeErrorOf } from "./common/errors.ts";
import { help } from "./tasks/help.ts";

const BIN_NAME = packageJson.name;

const PARSE_ARGS_ERROR_CODES = [
	"ERR_PARSE_ARGS_UNKNOWN_OPTION",
	"ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
	"ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
] as const;

// TODO: Project can be path to folder! Beware And read probably outcome from ts API

function isParseArgsError(error: unknown): error is TypeError {
	return PARSE_ARGS_ERROR_CODES.some((code) =>
		isNodeErrorOf(error, TypeError, code),
	);
}

function main() {
	const args = tryParseArgs();
	if (args === undefined) {
		return;
	}

	if (args.values.help) {
		help();
		return;
	}

	if (args.values.version) {
		print(
			`${BIN_NAME}/${packageJson.version} ${process.platform}-${process.arch} node-${process.versions.node} typescript-${ts.version}`,
		);

		// eslint-disable-next-line n/no-process-exit -- Help must stop before cleanup starts.
		process.exit(0);
	}

	const cwd = process.cwd();
	const tsconfigAbsolutePath = path.resolve(cwd, args.values.project);
	const tsconfigRelativePath = path.relative(cwd, tsconfigAbsolutePath);
	if (
		tsconfigRelativePath === "" ||
		tsconfigRelativePath === ".." ||
		tsconfigRelativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(tsconfigRelativePath)
	) {
		throw new Error(
			`Refusing to traverse outside current working directory to read tsconfig!`,
		);
	}

	print(`Using tsconfig: ${tsconfigRelativePath}`);

	const tsconfig = ts.getParsedCommandLineOfConfigFile(
		args.values.project,
		undefined,
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				printError(JSON.stringify(diagnostic));
				throw new Error("Unrecoverable config file diagnostic");
			},
		},
	);

	// TODO: What if there is error in tsconfig? How to handle?

	if (tsconfig?.options.outDir === undefined) {
		throw new Error("outDir is required");
	}

	const outDirRelativePath = path.relative(
		path.dirname(tsconfigAbsolutePath),
		tsconfig.options.outDir,
	);
	if (
		outDirRelativePath === "" ||
		outDirRelativePath === ".." ||
		outDirRelativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(outDirRelativePath)
	) {
		throw new Error(
			`Refusing to traverse outside safe paths containing tsconfig to process outDir!`,
		);
	}

	if (tsconfig.options.incremental === true) {
		throw new Error("Incremental mode is not supported");
	}

	if (tsconfig.options.tsBuildInfoFile !== undefined) {
		throw new Error("tsBuildInfoFile is not supported");
	}

	if (tsconfig.options.composite === true) {
		throw new Error("Composite mode is not supported");
	}

	if (tsconfig.options.project !== undefined) {
		throw new Error("Project mode is not supported");
	}

	if (tsconfig.options.declarationDir !== undefined) {
		throw new Error("declarationDir is not supported");
	}

	if (tsconfig.watchOptions) {
		throw new Error("Watch mode is not supported");
	}

	// TODO: Check for relative paths - are they normalized or what?

	// I’d make the guard more precise than comparing directory names: require an
	// Explicit outDir, then refuse if any source file in the TypeScript program is
	// Inside a directory the cleaner would scan. Apply the same check to declarationDir
	// If it is separate. This allows a normal src/ → dist/ project even when both sit
	// Under the project root, while rejecting in-place emission and output directories that
	// Contain source files. Check path containment by directory boundaries and account for
	// Symlinks before deleting.

	// TODO: stat.dev for dist/ folder must equal stat.dev for each file!

	if (args.values.noClean) {
		return;
	}

	print(JSON.stringify(tsconfig));

	const expectedOutDirPaths = new Set<string>();

	for (const file of tsconfig.fileNames) {
		const output = ts.getOutputFileNames(
			tsconfig,
			file,
			!ts.sys.useCaseSensitiveFileNames,
		);
		// TODO: statSync is okay for source, but for dist use lstatSync
		const stat = fs.statSync(file);

		print(file, " => ", JSON.stringify(output), JSON.stringify(stat));

		output.forEach((fiePath) => expectedOutDirPaths.add(fiePath));
	}

	print(JSON.stringify(expectedOutDirPaths));

	type Verdict =
		| { path: string; reason: string; type: "skipped" }
		| { path: string; type: "removeDir" }
		| { path: string; type: "removeFile" };

	function readDir(dirPath: string): {
		dirIsEmpty: boolean;
		verdicts: Verdict[];
	} {
		const verdicts: Verdict[] = [];
		// TODO: Does this need to be here?
		const stat = fs.lstatSync(dirPath);
		if (!stat.isDirectory()) {
			throw new Error(`Not a directory ${dirPath}!`);
		}

		let dirIsEmpty = true;

		for (const child of fs.readdirSync(dirPath)) {
			const fullPath = path.join(dirPath, child);
			const fullPathStat = fs.lstatSync(fullPath);

			if (fullPathStat.dev !== stat.dev) {
				if (args.values.verbose) {
					verdicts.push({
						path: fullPath,
						reason: "different device",
						type: "skipped",
					});
				}
				dirIsEmpty = false;
				continue;
			}

			if (fullPathStat.isFile()) {
				if (expectedOutDirPaths.has(fullPath)) {
					if (args.values.verbose) {
						verdicts.push({
							path: fullPath,
							reason: "expected output file",
							type: "skipped",
						});
					}
					dirIsEmpty = false;
					continue;
				}

				verdicts.push({ path: fullPath, type: "removeFile" });
				continue;
			}

			if (fullPathStat.isDirectory()) {
				const result = readDir(fullPath);

				verdicts.push(...result.verdicts);

				if (!result.dirIsEmpty) {
					dirIsEmpty = false;
				}
				continue;
			}

			// Unknown file type
			dirIsEmpty = false;
		}

		if (dirIsEmpty) {
			verdicts.push({ path: dirPath, type: "removeDir" });
		} else {
			verdicts.push({
				path: dirPath,
				reason: "directory not empty",
				type: "skipped",
			});
		}

		return { dirIsEmpty, verdicts };
	}

	const result = readDir(tsconfig.options.outDir);

	// TODO: Merge these two switches into single loop, and nest the verbose and dry conditions down
	if (args.values.verbose) {
		for (const verdict of result.verdicts) {
			switch (verdict.type) {
				case "removeDir":
					print(`Remove empty directory: ${verdict.path}`);
					break;
				case "removeFile":
					print(`Remove file: ${verdict.path}`);
					break;
				case "skipped":
					print(`Skipped (${verdict.reason}): ${verdict.path}`);
					break;
			}
		}
	}

	// TODO: Avoid running if any of src dirs is inside out dir - essentially so we don't wipe what we do have

	let removedDirs = 0;
	let removedFiles = 0;

	if (!args.values.dry) {
		for (const verdict of result.verdicts) {
			switch (verdict.type) {
				case "removeDir":
					fs.rmdirSync(verdict.path);
					removedDirs++;
					break;
				case "removeFile":
					fs.rmSync(verdict.path, { recursive: false });
					removedFiles++;
					break;
				case "skipped":
					break;
			}
		}
	}

	if (args.values.dry || removedDirs > 0 || removedFiles > 0) {
		print(
			`${BIN_NAME}: ${args.values.dry ? "Would remove" : "Removed"} ${removedFiles.toFixed()} files${removedDirs > 0 ? ` and ${removedDirs.toFixed()} empty directories` : ""} from ${styleText("italic", outDirRelativePath)}`,
		);
	}

	// TODO: For tsc-after, I’d make --dry print the files it would remove to stdout, followed by a count. A normal run
	//  Can print a short count; --verbose can print each removed path. Keep debug objects such as the current print(tsconfig)
	//  Out of normal output.
	//  Exit with 0 for success, including a dry run or nothing to remove; 1 for a cleanup or config error; and 2 for invalid CLI arguments.
	//  If you later want scripts to consume the file list, add a dedicated machine-readable option so the human summary does not get mixed into it.

	// TODO: Consider adding --all? To just wipe entire outDir?

	// TODO: On GHA, test it against different typescript versions installed. To make sure the API conforms!
}

function tryParseArgs() {
	try {
		return parseArgs({ options: cliArgsOptions });
	} catch (error) {
		if (isParseArgsError(error)) {
			printError(`${error.message}.`);
			return;
		}

		throw error;
	}
}

main();
