import fs from "node:fs";
import path from "node:path";

import { binName } from "../common/constants.ts";
import {
	assertUnreachable,
	isNodeErrorOf,
	UserError,
} from "../common/errors.ts";
import { isPathInside } from "../common/paths.ts";
import { loadCompiler } from "../common/typescript/loadCompiler.ts";
import { type ParsedCliArgs, print, styleText } from "../common/util.ts";

const MISSING_OUT_DIR_ERROR =
	'outDir is not set in tsconfig.json; tsc-after only cleans a dedicated outDir. Set compilerOptions.outDir, e.g. "dist".';

export async function mainAction(args: ParsedCliArgs): Promise<void> {
	const cwd = process.cwd();
	const compiler = await loadCompiler();
	let outDir: string;
	let outDirRelativePath: string;
	let expectedOutDirPaths: Set<string>;

	try {
		const isPathInsideWithCompiler = (dirPath: string, filePath: string) =>
			isPathInside(dirPath, filePath, compiler.useCaseSensitiveFileNames);
		const projectAbsolutePath = path.resolve(cwd, args.values.project);
		if (!isPathInsideWithCompiler(cwd, projectAbsolutePath)) {
			throw new UserError(
				`Refusing to traverse outside current working directory to read tsconfig!`,
			);
		}

		const tsconfigAbsolutePath =
			fs.existsSync(projectAbsolutePath) &&
			fs.statSync(projectAbsolutePath).isDirectory()
				? path.join(projectAbsolutePath, "tsconfig.json")
				: projectAbsolutePath;
		if (
			!isPathInsideWithCompiler(cwd, tsconfigAbsolutePath) ||
			isPathInsideWithCompiler(tsconfigAbsolutePath, cwd)
		) {
			throw new UserError(
				`Refusing to traverse outside current working directory to read tsconfig!`,
			);
		}
		const tsconfigRelativePath = path.relative(cwd, tsconfigAbsolutePath);

		print(`Using tsconfig: ${tsconfigRelativePath}`);
		const project = compiler.parseProject(tsconfigAbsolutePath);

		if (project.options.outDir === undefined) {
			throw new UserError(MISSING_OUT_DIR_ERROR);
		}
		outDir = project.options.outDir;
		const outDirAbsolutePath = path.resolve(outDir);

		outDirRelativePath = path.relative(cwd, outDirAbsolutePath);
		if (
			!isPathInsideWithCompiler(cwd, outDirAbsolutePath) ||
			isPathInsideWithCompiler(outDirAbsolutePath, cwd)
		) {
			throw new UserError(
				`Refusing to traverse outside safe paths containing tsconfig to process outDir!`,
			);
		}

		if (project.options.incremental === true) {
			throw new UserError("Incremental mode is not supported");
		}

		if (project.options.tsBuildInfoFile !== undefined) {
			throw new UserError("tsBuildInfoFile is not supported");
		}

		if (project.options.composite === true) {
			throw new UserError("Composite mode is not supported");
		}

		if (project.options.project !== undefined) {
			throw new UserError("Project mode is not supported");
		}

		if (project.options.declarationDir !== undefined) {
			throw new UserError("declarationDir is not supported");
		}

		if (project.hasWatchOptions) {
			throw new UserError("Watch mode is not supported");
		}

		const isInsideOutDir = (filePath: string) =>
			isPathInsideWithCompiler(outDirAbsolutePath, filePath) ||
			isPathInsideWithCompiler(outDirAbsolutePath, fs.realpathSync(filePath));

		for (const file of project.fileNames) {
			if (isInsideOutDir(path.resolve(file))) {
				throw new UserError(
					`Refusing to clean outDir '${outDirRelativePath}': it contains source file '${path.relative(cwd, file)}'.`,
				);
			}
		}

		for (const file of project.configFilePaths) {
			if (isInsideOutDir(path.resolve(file))) {
				throw new UserError(
					`Refusing to clean outDir '${outDirRelativePath}': it contains config file '${path.relative(cwd, file)}'.`,
				);
			}
		}

		if (args.values.noClean) {
			return;
		}

		expectedOutDirPaths = compiler.getOutputPaths(project);
	} finally {
		compiler.close();
	}

	type Verdict =
		| { path: string; reason: string; type: "skipped" }
		| { path: string; type: "removeDir" }
		| { path: string; type: "removeFile" };

	function readDir(dirPath: string): {
		dirIsEmpty: boolean;
		verdicts: Verdict[];
	} {
		const verdicts: Verdict[] = [];
		const stat = fs.lstatSync(dirPath);

		if (!stat.isDirectory()) {
			throw new UserError(`Not a directory ${dirPath}!`);
		}

		let dirIsEmpty = true;

		for (const child of fs.readdirSync(dirPath).sort()) {
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

			if (fullPathStat.isSymbolicLink()) {
				if (args.values.verbose) {
					verdicts.push({
						path: fullPath,
						reason: "symbolic link",
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

	let outDirExists = true;
	try {
		fs.lstatSync(outDir);
	} catch (error) {
		if (!isNodeErrorOf(error, Error, "ENOENT")) {
			throw error;
		}

		outDirExists = false;
	}

	if (outDirExists && fs.realpathSync(outDir) !== path.resolve(outDir)) {
		throw new UserError(
			`Refusing to clean outDir through a symbolic link: ${outDirRelativePath}!`,
		);
	}

	const result = outDirExists ? readDir(outDir) : { verdicts: [] };

	const { dry, verbose } = args.values;
	const removeVerb = dry ? "Would remove" : "Removed";
	let fileCount = 0;
	let dirCount = 0;

	for (const verdict of result.verdicts) {
		const displayPath = path.relative(cwd, verdict.path);

		switch (verdict.type) {
			case "removeDir":
				if (!dry) {
					fs.rmdirSync(verdict.path);
				}
				dirCount++;
				if (dry || verbose) {
					print(`${removeVerb} empty directory: ${displayPath}`);
				}
				break;
			case "removeFile":
				if (!dry) {
					fs.rmSync(verdict.path, { recursive: false });
				}
				fileCount++;
				if (dry || verbose) {
					print(`${removeVerb} file: ${displayPath}`);
				}
				break;
			case "skipped":
				if (verbose) {
					print(`Skipped (${verdict.reason}): ${displayPath}`);
				}
				break;
			default:
				assertUnreachable(verdict);
		}
	}

	const parts: string[] = [];
	if (fileCount > 0) {
		parts.push(formatCount(fileCount, "file", "files"));
	}
	if (dirCount > 0) {
		parts.push(formatCount(dirCount, "empty directory", "empty directories"));
	}

	if (parts.length > 0) {
		print(
			`${binName}: ${removeVerb} ${parts.join(" and ")} from ${styleText("italic", outDirRelativePath)}`,
		);
	} else if (dry) {
		print(
			`${binName}: Nothing to remove from ${styleText("italic", outDirRelativePath)}`,
		);
	}
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count.toFixed()} ${count === 1 ? singular : plural}`;
}
