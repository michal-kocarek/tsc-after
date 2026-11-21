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
const NO_EMIT_ERROR = "Refusing to clean outDir because noEmit is enabled.";
const DECLARATION_DISABLED_ERROR =
	"Refusing to clean declarationDir because declaration is not enabled.";

interface CleanupRoot {
	name: "declarationDir" | "outDir";
	path: string;
	relativePath: string;
}

export async function mainAction(args: ParsedCliArgs): Promise<void> {
	const cwd = process.cwd();
	const compiler = await loadCompiler();
	let cleanupRoots: CleanupRoot[];
	let expectedOutDirPaths: Set<string>;
	let outDirAbsolutePath: string;

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
		if (project.options.noEmit === true) {
			throw new UserError(NO_EMIT_ERROR);
		}
		if (project.options.outFile !== undefined) {
			throw new UserError("outFile is not supported");
		}

		if (project.options.outDir === undefined) {
			throw new UserError(MISSING_OUT_DIR_ERROR);
		}
		outDirAbsolutePath = path.resolve(project.options.outDir);
		const roots: CleanupRoot[] = [
			{
				name: "outDir",
				path: outDirAbsolutePath,
				relativePath: path.relative(cwd, outDirAbsolutePath),
			},
		];
		if (project.options.declarationDir !== undefined) {
			if (project.options.declaration !== true) {
				throw new UserError(DECLARATION_DISABLED_ERROR);
			}
			const declarationDir = path.resolve(project.options.declarationDir);
			roots.push({
				name: "declarationDir",
				path: declarationDir,
				relativePath: path.relative(cwd, declarationDir),
			});
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

		if (project.hasWatchOptions) {
			throw new UserError("Watch mode is not supported");
		}

		for (const root of roots) {
			if (
				!isPathInsideWithCompiler(cwd, root.path) ||
				isPathInsideWithCompiler(root.path, cwd)
			) {
				throw new UserError(
					`Refusing to traverse outside safe paths containing tsconfig to process ${root.name}!`,
				);
			}
			const isInsideRoot = (filePath: string) =>
				isPathInsideWithCompiler(root.path, filePath) ||
				isPathInsideWithCompiler(root.path, fs.realpathSync(filePath));

			for (const file of project.programFileNames) {
				if (isInsideRoot(path.resolve(file))) {
					throw new UserError(
						`Refusing to clean ${root.name} '${root.relativePath}': it contains source file '${path.relative(cwd, file)}'.`,
					);
				}
			}

			for (const file of project.configFilePaths) {
				if (isInsideRoot(path.resolve(file))) {
					throw new UserError(
						`Refusing to clean ${root.name} '${root.relativePath}': it contains config file '${path.relative(cwd, file)}'.`,
					);
				}
			}

			try {
				fs.lstatSync(root.path);
				if (fs.realpathSync(root.path) !== root.path) {
					throw new UserError(
						`Refusing to clean ${root.name} through a symbolic link: ${root.relativePath}!`,
					);
				}
			} catch (error) {
				if (!isNodeErrorOf(error, Error, "ENOENT")) {
					throw error;
				}
			}
		}
		cleanupRoots = roots.filter(
			(root) =>
				root.name === "outDir" ||
				!isPathInsideWithCompiler(outDirAbsolutePath, root.path),
		);

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

	const results = cleanupRoots.map((root) => {
		try {
			fs.lstatSync(root.path);
		} catch (error) {
			if (!isNodeErrorOf(error, Error, "ENOENT")) {
				throw error;
			}
			return { verdicts: [] };
		}
		return readDir(root.path);
	});

	const { dry, verbose } = args.values;
	const removeVerb = dry ? "Would remove" : "Removed";
	for (const [index, root] of cleanupRoots.entries()) {
		const result = results[index];
		if (result === undefined) {
			throw new Error("Missing cleanup result.");
		}
		let fileCount = 0;
		let dirCount = 0;

		for (const verdict of result.verdicts) {
			if (
				root.name === "declarationDir" &&
				isPathInside(
					outDirAbsolutePath,
					verdict.path,
					compiler.useCaseSensitiveFileNames,
				)
			) {
				continue;
			}
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
				`${binName}: ${removeVerb} ${parts.join(" and ")} from ${styleText("italic", root.relativePath)}`,
			);
		} else if (dry || cleanupRoots.length > 1) {
			print(
				`${binName}: Nothing to remove from ${styleText("italic", root.relativePath)}`,
			);
		}
	}
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count.toFixed()} ${count === 1 ? singular : plural}`;
}
