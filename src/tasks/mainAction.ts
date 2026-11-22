import path from "node:path";

import { applyCleanup, planCleanup } from "../common/cleanup.ts";
import { binName } from "../common/constants.ts";
import { assertUnreachable } from "../common/errors.ts";
import { loadProject } from "../common/project.ts";
import { type ParsedCliArgs, print, styleText } from "../common/util.ts";

export async function mainAction(args: ParsedCliArgs): Promise<void> {
	const cwd = process.cwd();
	const project = await loadProject(args.values.project, cwd);
	print(`Using tsconfig: ${path.relative(cwd, project.configFilePath)}`);

	const plan = planCleanup(project, cwd);
	if (args.values.noClean) {
		return;
	}

	const { dry, verbose } = args.values;
	const results = applyCleanup(plan, { dry });
	const removeVerb = dry ? "Would remove" : "Removed";
	for (const { root, verdicts } of results) {
		let fileCount = 0;
		let dirCount = 0;

		for (const verdict of verdicts) {
			const displayPath = path.relative(cwd, verdict.path);

			switch (verdict.type) {
				case "removeDir":
					dirCount++;
					if (dry || verbose) {
						print(`${removeVerb} empty directory: ${displayPath}`);
					}
					break;
				case "removeFile":
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
		} else if (dry || results.length > 1) {
			print(
				`${binName}: Nothing to remove from ${styleText("italic", root.relativePath)}`,
			);
		}
	}
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count.toFixed()} ${count === 1 ? singular : plural}`;
}
