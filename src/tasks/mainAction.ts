import fs from "node:fs";
import path from "node:path";

import {
	type CleanupRoot,
	readCleanupRoot,
	resolveCleanupRoots,
} from "../common/cleanupRoots.ts";
import { binName } from "../common/constants.ts";
import {
	assertUnreachable,
	isNodeErrorOf,
	UserError,
} from "../common/errors.ts";
import { isPathInside } from "../common/paths.ts";
import { loadCompiler } from "../common/typescript/loadCompiler.ts";
import { type ParsedCliArgs, print, styleText } from "../common/util.ts";

const NO_EMIT_ERROR = "Refusing to clean outDir because noEmit is enabled.";

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

		cleanupRoots = resolveCleanupRoots(
			project,
			cwd,
			compiler.useCaseSensitiveFileNames,
		);
		const outDirRoot = cleanupRoots.find((root) => root.name === "outDir");
		if (outDirRoot === undefined) {
			throw new Error("Missing outDir cleanup root.");
		}
		outDirAbsolutePath = outDirRoot.path;

		if (args.values.noClean) {
			return;
		}

		expectedOutDirPaths = compiler.getOutputPaths(project);
	} finally {
		compiler.close();
	}

	const results = cleanupRoots.map((root) =>
		readCleanupRoot(root, expectedOutDirPaths),
	);

	const { dry, verbose } = args.values;
	const removeVerb = dry ? "Would remove" : "Removed";
	for (const [index, root] of cleanupRoots.entries()) {
		const result = results[index];
		if (result === undefined) {
			throw new Error("Missing cleanup result.");
		}
		let fileCount = 0;
		let dirCount = 0;

		for (const verdict of result) {
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
						try {
							fs.rmdirSync(verdict.path);
						} catch (error) {
							if (
								verdict.path === root.path &&
								isNodeErrorOf(error, Error, "EBUSY")
							) {
								if (verbose) {
									print(`Skipped (busy directory): ${displayPath}`);
								}
								break;
							}
							throw error;
						}
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
