import fs from "node:fs";
import path from "node:path";

import type { Project } from "./project.ts";

import { isNodeErrorOf, UserError } from "./errors.ts";
import { isPathInside, normalizePathForComparison, realpath } from "./paths.ts";

export interface CopyEntry {
	destination: string;
	source: string;
}

export type CopyPlan = readonly CopyVerdict[];

type CopyVerdict =
	| {
			destinationPath: string;
			reason: "up to date";
			sourcePath: string;
			type: "skipped";
	  }
	| { destinationPath: string; sourcePath: string; type: "copyFile" };

export function parseCopyEntry(value: string): CopyEntry | undefined {
	const separator = value.lastIndexOf(":");

	if (separator <= 0 || separator === value.length - 1) {
		return undefined;
	}

	return {
		destination: value.slice(separator + 1),
		source: value.slice(0, separator),
	};
}

/** Validates every entry without changing files and plans copies that are needed. */
export function planCopy(
	entries: readonly CopyEntry[],
	project: Pick<
		Project,
		"declarationDir" | "outDir" | "outputPaths" | "useCaseSensitiveFileNames"
	>,
	cwd: string,
): CopyPlan {
	const { outDir, useCaseSensitiveFileNames } = project;
	const destinationPaths = entries.map(({ destination }) => {
		if (path.isAbsolute(destination)) {
			throw refusingCopyTo(
				destination,
				"destination must be relative to outDir",
			);
		}
		if (destination.split(/[/\\]/u).includes("..")) {
			throw refusingCopyTo(destination, "destination must not contain '..'");
		}
		if (destination.endsWith("/") || destination.endsWith("\\")) {
			throw refusingCopyTo(destination, "destination must be a file path");
		}

		const destinationPath = path.resolve(outDir, destination);
		if (
			normalizePathForComparison(destinationPath, useCaseSensitiveFileNames) ===
			normalizePathForComparison(outDir, useCaseSensitiveFileNames)
		) {
			throw refusingCopyTo(
				relativePath(cwd, destinationPath),
				"it resolves to outDir",
			);
		}
		if (!isPathInside(outDir, destinationPath, useCaseSensitiveFileNames)) {
			throw refusingCopyTo(
				relativePath(cwd, destinationPath),
				"destination must be inside outDir",
			);
		}

		return destinationPath;
	});

	assertDestinationsDoNotConflict(
		destinationPaths,
		project.outputPaths,
		useCaseSensitiveFileNames,
		cwd,
	);

	return entries.map(({ source }, index) => {
		const destinationPath = destinationPaths[index];
		if (destinationPath === undefined) {
			throw new Error("Unreachable copy destination.");
		}

		const sourcePath = path.resolve(cwd, source);
		if (!isPathInside(cwd, sourcePath, useCaseSensitiveFileNames)) {
			throw refusingCopySource(
				source,
				"it is outside the current working directory",
			);
		}

		const sourceStat = lstatIfExists(sourcePath);
		if (sourceStat === undefined) {
			throw refusingCopySource(source, "it does not exist");
		}
		if (sourceStat.isSymbolicLink()) {
			throw refusingCopySource(source, "it is a symbolic link");
		}
		if (!sourceStat.isFile()) {
			throw refusingCopySource(source, "it is not a regular file");
		}

		const sourceRealPath = realpath(sourcePath);
		const realCwd = realpath(cwd);
		if (!isPathInside(realCwd, sourceRealPath, useCaseSensitiveFileNames)) {
			throw refusingCopySource(
				source,
				"its real path is outside the current working directory",
			);
		}

		for (const [rootName, rootPath] of [
			["outDir", outDir],
			...(project.declarationDir === undefined
				? []
				: [["declarationDir", project.declarationDir]]),
		] as const) {
			if (
				isPathInside(rootPath, sourcePath, useCaseSensitiveFileNames) ||
				isPathInside(rootPath, sourceRealPath, useCaseSensitiveFileNames)
			) {
				throw refusingCopySource(
					source,
					`it is inside ${rootName} '${relativePath(cwd, rootPath)}'`,
				);
			}
		}

		const destinationStat = validateDestinationPath(
			outDir,
			destinationPath,
			cwd,
		);
		if (
			destinationStat?.size === sourceStat.size &&
			fs.readFileSync(sourcePath).equals(fs.readFileSync(destinationPath))
		) {
			return {
				destinationPath,
				reason: "up to date",
				sourcePath,
				type: "skipped",
			};
		}

		return { destinationPath, sourcePath, type: "copyFile" };
	});
}

/** Creates parent directories and copies planned files unless this is a dry run. */
export function applyCopy(plan: CopyPlan, { dry }: { dry: boolean }): CopyPlan {
	if (dry) {
		return plan;
	}

	for (const verdict of plan) {
		if (verdict.type === "copyFile") {
			fs.mkdirSync(path.dirname(verdict.destinationPath), { recursive: true });
			fs.copyFileSync(verdict.sourcePath, verdict.destinationPath);
		}
	}

	return plan;
}

function assertDestinationsDoNotConflict(
	destinationPaths: readonly string[],
	outputPaths: ReadonlySet<string>,
	useCaseSensitiveFileNames: boolean,
	cwd: string,
): void {
	const overlaps = (left: string, right: string) =>
		isPathInside(left, right, useCaseSensitiveFileNames) ||
		isPathInside(right, left, useCaseSensitiveFileNames);

	for (const [index, destinationPath] of destinationPaths.entries()) {
		for (const otherDestinationPath of destinationPaths.slice(index + 1)) {
			if (overlaps(destinationPath, otherDestinationPath)) {
				const samePath =
					normalizePathForComparison(
						destinationPath,
						useCaseSensitiveFileNames,
					) ===
					normalizePathForComparison(
						otherDestinationPath,
						useCaseSensitiveFileNames,
					);
				throw refusingCopyTo(
					relativePath(cwd, destinationPath),
					samePath
						? "it is shared with another copy entry"
						: "it is nested with another copy destination",
				);
			}
		}

		for (const outputPath of outputPaths) {
			if (overlaps(destinationPath, outputPath)) {
				const samePath =
					normalizePathForComparison(
						destinationPath,
						useCaseSensitiveFileNames,
					) ===
					normalizePathForComparison(outputPath, useCaseSensitiveFileNames);
				throw refusingCopyTo(
					relativePath(cwd, destinationPath),
					samePath
						? "it is an output of the project"
						: "it overlaps an output of the project",
				);
			}
		}
	}
}

function lstatIfExists(filePath: string): fs.Stats | undefined {
	try {
		return fs.lstatSync(filePath);
	} catch (error) {
		if (
			isNodeErrorOf(error, Error, "ENOENT") ||
			isNodeErrorOf(error, Error, "ENOTDIR")
		) {
			return undefined;
		}
		throw error;
	}
}

function refusingCopySource(source: string, reason: string): UserError {
	return new UserError(`Refusing to copy '${source}': ${reason}.`);
}

function refusingCopyTo(destination: string, reason: string): UserError {
	return new UserError(`Refusing to copy to '${destination}': ${reason}.`);
}

function relativePath(cwd: string, filePath: string): string {
	return path.relative(cwd, filePath) || ".";
}

function validateDestinationPath(
	outDir: string,
	destinationPath: string,
	cwd: string,
): fs.Stats | undefined {
	const relativePathFromOutDir = path.relative(outDir, destinationPath);
	const components = relativePathFromOutDir.split(path.sep).filter(Boolean);
	let currentPath = outDir;

	for (const component of components.slice(0, -1)) {
		currentPath = path.join(currentPath, component);
		const stat = lstatIfExists(currentPath);
		if (stat === undefined) {
			break;
		}
		if (stat.isSymbolicLink()) {
			throw refusingCopyTo(
				relativePath(cwd, destinationPath),
				`path component '${relativePath(cwd, currentPath)}' is a symbolic link`,
			);
		}
		if (!stat.isDirectory()) {
			throw refusingCopyTo(
				relativePath(cwd, destinationPath),
				`path component '${relativePath(cwd, currentPath)}' is not a directory`,
			);
		}
	}

	const destinationStat = lstatIfExists(destinationPath);
	if (destinationStat?.isSymbolicLink() === true) {
		throw refusingCopyTo(
			relativePath(cwd, destinationPath),
			"it is a symbolic link",
		);
	}
	if (destinationStat !== undefined && !destinationStat.isFile()) {
		throw refusingCopyTo(
			relativePath(cwd, destinationPath),
			"it is not a regular file",
		);
	}

	return destinationStat;
}
