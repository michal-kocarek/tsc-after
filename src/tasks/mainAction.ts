import fs from "node:fs";
import path from "node:path";

import {
	readCleanupRoot,
	resolveCleanupRoots,
} from "../common/cleanupRoots.ts";
import { binName } from "../common/constants.ts";
import { assertUnreachable, isNodeErrorOf } from "../common/errors.ts";
import { isPathInside } from "../common/paths.ts";
import { loadProject } from "../common/project.ts";
import { type ParsedCliArgs, print, styleText } from "../common/util.ts";

export async function mainAction(args: ParsedCliArgs): Promise<void> {
	const cwd = process.cwd();
	const project = await loadProject(args.values.project, cwd);
	print(`Using tsconfig: ${path.relative(cwd, project.configFilePath)}`);

	const cleanupRoots = resolveCleanupRoots(project, cwd);
	if (args.values.noClean) {
		return;
	}

	const results = cleanupRoots.map((root) =>
		readCleanupRoot(
			root,
			project.outputPaths,
			project.useCaseSensitiveFileNames,
		),
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
					project.outDir,
					verdict.path,
					project.useCaseSensitiveFileNames,
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
