import path from "node:path";

import {
	applyCleanup,
	type CleanupPlan,
	planCleanup,
	resolveCleanupRoots,
} from "../common/cleanup.ts";
import { binName } from "../common/constants.ts";
import { applyCopy, type CopyPlan, planCopy } from "../common/copy.ts";
import { assertUnreachable } from "../common/errors.ts";
import { realpath } from "../common/paths.ts";
import { loadProject } from "../common/project.ts";
import { type ParsedCliArgs, print, styleText } from "../common/util.ts";

export async function mainAction(args: ParsedCliArgs): Promise<void> {
	const cwd = realpath(process.cwd());
	const project = await loadProject(args.values.project, cwd);
	print(`Using tsconfig: ${path.relative(cwd, project.configFilePath)}`);

	const roots = resolveCleanupRoots(project, cwd);
	const copyPlan = planCopy(args.copyEntries, project, roots, cwd);
	const cleanupPlan = planCleanup(
		project,
		roots,
		copyPlan.map(({ destinationPath }) => destinationPath),
	);
	const { dry, verbose } = args.values;
	const cleanupResults = args.values.noClean
		? []
		: applyCleanup(cleanupPlan, { dry });
	applyCopy(copyPlan, { dry });

	reportCleanupVerdicts(cleanupResults, cwd, { dry, verbose });
	reportCopyVerdicts(copyPlan, cwd, { dry, verbose });
	reportSummaries(cleanupPlan, cleanupResults, copyPlan, {
		dry,
		hasCopyEntries: copyPlan.length > 0,
		noClean: args.values.noClean,
	});
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count.toFixed()} ${count === 1 ? singular : plural}`;
}

function reportCleanupVerdicts(
	results: CleanupPlan,
	cwd: string,
	{ dry, verbose }: { dry: boolean; verbose: boolean },
): void {
	const removeVerb = dry ? "Would remove" : "Removed";
	for (const { verdicts } of results) {
		for (const verdict of verdicts) {
			const displayPath = path.relative(cwd, verdict.path);

			switch (verdict.type) {
				case "removeDir":
					if (dry || verbose) {
						print(`${removeVerb} empty directory: ${displayPath}`);
					}
					break;
				case "removeFile":
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
	}
}

function reportCopyVerdicts(
	results: CopyPlan,
	cwd: string,
	{ dry, verbose }: { dry: boolean; verbose: boolean },
): void {
	for (const verdict of results) {
		const sourcePath = path.relative(cwd, verdict.sourcePath);
		const destinationPath = path.relative(cwd, verdict.destinationPath);

		if (verdict.type === "copyFile") {
			if (dry || verbose) {
				print(
					`${dry ? "Would copy" : "Copied"} file: ${sourcePath} -> ${destinationPath}`,
				);
			}
		} else if (verbose) {
			print(`Skipped (up to date): ${sourcePath} -> ${destinationPath}`);
		}
	}
}

function reportSummaries(
	cleanupPlan: CleanupPlan,
	cleanupResults: CleanupPlan,
	copyResults: CopyPlan,
	{
		dry,
		hasCopyEntries,
		noClean,
	}: { dry: boolean; hasCopyEntries: boolean; noClean: boolean },
): void {
	const verbs = dry
		? { copy: "Would copy", remove: "Would remove", removeAfterCopy: "remove" }
		: { copy: "Copied", remove: "Removed", removeAfterCopy: "removed" };
	const cleanupResultsByRoot = new Map(
		cleanupResults.map(({ root, verdicts }) => [root.path, verdicts]),
	);

	for (const { root } of cleanupPlan) {
		if (noClean && root.name !== "outDir") {
			continue;
		}

		const copyCount =
			root.name === "outDir"
				? copyResults.filter(({ type }) => type === "copyFile").length
				: 0;
		const verdicts = cleanupResultsByRoot.get(root.path) ?? [];
		const fileCount = verdicts.filter(
			({ type }) => type === "removeFile",
		).length;
		const dirCount = verdicts.filter(({ type }) => type === "removeDir").length;
		const removeParts: string[] = [];
		if (fileCount > 0) {
			removeParts.push(formatCount(fileCount, "file", "files"));
		}
		if (dirCount > 0) {
			removeParts.push(
				formatCount(dirCount, "empty directory", "empty directories"),
			);
		}

		const actionParts: string[] = [];
		if (copyCount > 0) {
			actionParts.push(
				`${verbs.copy} ${formatCount(copyCount, "file", "files")}`,
			);
		}
		if (!noClean && removeParts.length > 0) {
			const removeVerb = copyCount > 0 ? verbs.removeAfterCopy : verbs.remove;
			actionParts.push(`${removeVerb} ${removeParts.join(" and ")}`);
		}

		if (actionParts.length === 0) {
			if (dry || cleanupPlan.length > 1) {
				const nothingToDo = noClean
					? "Nothing to copy to"
					: root.name === "outDir" && hasCopyEntries
						? "Nothing to copy or remove from"
						: "Nothing to remove from";
				print(
					`${binName}: ${nothingToDo} ${styleText("italic", root.relativePath)}`,
				);
			}
			continue;
		}

		const preposition =
			copyCount > 0 && removeParts.length === 0 ? "to" : "from";
		print(
			`${binName}: ${actionParts.join(" and ")} ${preposition} ${styleText("italic", root.relativePath)}`,
		);
	}
}
