import path from "node:path";

import { applyCleanup, planCleanup } from "../common/cleanup.ts";
import { binName } from "../common/constants.ts";
import { applyCopy, planCopy } from "../common/copy.ts";
import { assertUnreachable } from "../common/errors.ts";
import { realpath } from "../common/paths.ts";
import { loadProject } from "../common/project.ts";
import { type ParsedCliArgs, print, styleText } from "../common/util.ts";

export async function mainAction(args: ParsedCliArgs): Promise<void> {
	const cwd = realpath(process.cwd());
	const project = await loadProject(args.values.project, cwd);
	print(`Using tsconfig: ${path.relative(cwd, project.configFilePath)}`);

	const copyPlan = planCopy(args.copyEntries, project, cwd);
	const cleanupPlan = planCleanup(
		project,
		cwd,
		copyPlan.map(({ destinationPath }) => destinationPath),
	);
	const { dry, verbose } = args.values;
	const cleanupResults = args.values.noClean
		? []
		: applyCleanup(cleanupPlan, { dry });
	const copyResults = applyCopy(copyPlan, { dry });

	reportCleanupVerdicts(cleanupResults, cwd, { dry, verbose });
	reportCopyVerdicts(copyResults, cwd, { dry, verbose });
	reportSummaries(cleanupPlan, cleanupResults, copyResults, {
		dry,
		hasCopyEntries: copyPlan.length > 0,
		noClean: args.values.noClean,
	});
}

function formatCount(count: number, singular: string, plural: string): string {
	return `${count.toFixed()} ${count === 1 ? singular : plural}`;
}

function reportCleanupVerdicts(
	results: ReturnType<typeof applyCleanup>,
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
	results: ReturnType<typeof applyCopy>,
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
	cleanupPlan: ReturnType<typeof planCleanup>,
	cleanupResults: ReturnType<typeof applyCleanup>,
	copyResults: ReturnType<typeof applyCopy>,
	{
		dry,
		hasCopyEntries,
		noClean,
	}: { dry: boolean; hasCopyEntries: boolean; noClean: boolean },
): void {
	const copyCount = copyResults.filter(
		({ type }) => type === "copyFile",
	).length;
	const cleanupResultsByRoot = new Map(
		cleanupResults.map(({ root, verdicts }) => [root.path, verdicts]),
	);

	for (const { root } of cleanupPlan) {
		if (noClean && root.name !== "outDir") {
			continue;
		}

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

		if (noClean) {
			if (copyCount > 0) {
				const copyVerb = dry ? "Would copy" : "Copied";
				print(
					`${copyVerb} ${formatCount(copyCount, "file", "files")} to ${styleText("italic", root.relativePath)}`,
				);
			} else if (dry || cleanupPlan.length > 1) {
				print(`Nothing to copy to ${styleText("italic", root.relativePath)}`);
			}
			continue;
		}

		if (copyCount > 0 && root.name === "outDir") {
			const copySummary = `${dry ? "Would copy" : "Copied"} ${formatCount(copyCount, "file", "files")}`;
			if (removeParts.length > 0) {
				const removeSummary = `${dry ? "remove" : "removed"} ${removeParts.join(" and ")}`;
				print(
					`${dry ? "" : `${binName}: `}${copySummary} and ${removeSummary} from ${styleText("italic", root.relativePath)}`,
				);
			} else {
				print(
					`${dry ? "" : `${binName}: `}${copySummary} to ${styleText("italic", root.relativePath)}`,
				);
			}
		} else if (removeParts.length > 0) {
			const removeVerb = dry ? "Would remove" : "Removed";
			print(
				`${binName}: ${removeVerb} ${removeParts.join(" and ")} from ${styleText("italic", root.relativePath)}`,
			);
		} else if (dry || cleanupPlan.length > 1) {
			const nothingVerb =
				root.name === "outDir" && hasCopyEntries
					? "Nothing to copy or remove from"
					: "Nothing to remove from";
			print(
				`${binName}: ${nothingVerb} ${styleText("italic", root.relativePath)}`,
			);
		}
	}
}
