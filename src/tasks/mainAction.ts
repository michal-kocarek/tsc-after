import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { binName } from "../common/constants.ts";
import { isNodeErrorOf, UserError } from "../common/errors.ts";
import { isPathInside } from "../common/paths.ts";
import { type ParsedCliArgs, print, styleText } from "../common/util.ts";

const MISSING_OUT_DIR_ERROR =
	'outDir is not set in tsconfig.json; tsc-after only cleans a dedicated outDir. Set compilerOptions.outDir, e.g. "dist".';

export function mainAction(args: ParsedCliArgs) {
	const cwd = process.cwd();
	const projectAbsolutePath = path.resolve(cwd, args.values.project);
	if (!isPathInside(cwd, projectAbsolutePath)) {
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
		!isPathInside(cwd, tsconfigAbsolutePath) ||
		isPathInside(tsconfigAbsolutePath, cwd)
	) {
		throw new UserError(
			`Refusing to traverse outside current working directory to read tsconfig!`,
		);
	}
	const tsconfigRelativePath = path.relative(cwd, tsconfigAbsolutePath);

	print(`Using tsconfig: ${tsconfigRelativePath}`);
	const formatHost: ts.FormatDiagnosticsHost = {
		getCanonicalFileName: (fileName) => fileName,
		getCurrentDirectory: () => cwd,
		getNewLine: () => ts.sys.newLine,
	};

	const tsconfig = ts.getParsedCommandLineOfConfigFile(
		tsconfigAbsolutePath,
		undefined,
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new UserError(
					ts.formatDiagnostics([diagnostic], formatHost).trimEnd(),
				);
			},
		},
	);

	if (tsconfig === undefined) {
		throw new UserError("Could not read tsconfig.json.");
	}

	if (tsconfig.errors.length > 0) {
		throw new UserError(
			ts.formatDiagnostics(tsconfig.errors, formatHost).trimEnd(),
		);
	}

	if (tsconfig.options.outDir === undefined) {
		throw new UserError(MISSING_OUT_DIR_ERROR);
	}
	const outDir = tsconfig.options.outDir;
	const outDirAbsolutePath = path.resolve(outDir);

	const outDirRelativePath = path.relative(cwd, outDirAbsolutePath);
	if (
		!isPathInside(cwd, outDirAbsolutePath) ||
		isPathInside(outDirAbsolutePath, cwd)
	) {
		throw new UserError(
			`Refusing to traverse outside safe paths containing tsconfig to process outDir!`,
		);
	}

	if (tsconfig.options.incremental === true) {
		throw new UserError("Incremental mode is not supported");
	}

	if (tsconfig.options.tsBuildInfoFile !== undefined) {
		throw new UserError("tsBuildInfoFile is not supported");
	}

	if (tsconfig.options.composite === true) {
		throw new UserError("Composite mode is not supported");
	}

	if (tsconfig.options.project !== undefined) {
		throw new UserError("Project mode is not supported");
	}

	if (tsconfig.options.declarationDir !== undefined) {
		throw new UserError("declarationDir is not supported");
	}

	if (tsconfig.watchOptions) {
		throw new UserError("Watch mode is not supported");
	}

	const isInsideOutDir = (filePath: string) =>
		isPathInside(outDirAbsolutePath, filePath) ||
		isPathInside(outDirAbsolutePath, fs.realpathSync(filePath));

	for (const file of tsconfig.fileNames) {
		if (isInsideOutDir(path.resolve(file))) {
			throw new UserError(
				`Refusing to clean outDir '${outDirRelativePath}': it contains source file '${path.relative(cwd, file)}'.`,
			);
		}
	}

	const configFile = tsconfig.options["configFile"] as
		ts.TsConfigSourceFile | undefined;

	const configFilePaths: string[] = [
		configFile?.fileName ?? tsconfigAbsolutePath,
		...(configFile?.extendedSourceFiles ?? []),
	];
	for (const file of configFilePaths) {
		if (isInsideOutDir(path.resolve(file))) {
			throw new UserError(
				`Refusing to clean outDir '${outDirRelativePath}': it contains config file '${path.relative(cwd, file)}'.`,
			);
		}
	}

	// TODO: stat.dev for dist/ folder must equal stat.dev for each file!

	if (args.values.noClean) {
		return;
	}

	const expectedOutDirPaths = new Set<string>();

	for (const file of tsconfig.fileNames) {
		const output = ts.getOutputFileNames(
			tsconfig,
			file,
			!ts.sys.useCaseSensitiveFileNames,
		);

		output.forEach((fiePath) => expectedOutDirPaths.add(fiePath));
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
			`${binName}: ${args.values.dry ? "Would remove" : "Removed"} ${removedFiles.toFixed()} files${removedDirs > 0 ? ` and ${removedDirs.toFixed()} empty directories` : ""} from ${styleText("italic", outDirRelativePath)}`,
		);
	}

	// TODO: For tsc-after, I’d make --dry print the files it would remove to stdout, followed by a count. A normal run
	//  Can print a short count; --verbose can print each removed path. Keep debug objects such as the current print(tsconfig)
	//  Out of normal output.
	//  If you later want scripts to consume the file list, add a dedicated machine-readable option so the human summary does not get mixed into it.

	// TODO: Consider adding --all? To just wipe entire outDir?

	// TODO: On GHA, test it against different typescript versions installed. To make sure the API conforms!
}
