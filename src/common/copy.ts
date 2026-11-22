import fs from "node:fs";
import path from "node:path";

import type { CleanupRoot } from "./cleanup.ts";
import type { Project } from "./project.ts";

import { UserError } from "./errors.ts";
import {
	isPathInside,
	lstatIfExists,
	normalizedAncestorDirPaths,
	normalizePathForComparison,
	realpath,
} from "./paths.ts";

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
	roots: readonly CleanupRoot[],
	cwd: string,
): CopyPlan {
	const { outDir, useCaseSensitiveFileNames } = project;
	const resolvedEntries = entries.map((entry) => {
		const { destination } = entry;
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

		return { destinationPath, entry };
	});

	assertDestinationsDoNotConflict(
		resolvedEntries.map(({ destinationPath }) => destinationPath),
		project.outputPaths,
		outDir,
		useCaseSensitiveFileNames,
		cwd,
	);

	return resolvedEntries.map(({ destinationPath, entry: { source } }) => {
		const sourcePath = path.resolve(cwd, source);
		const sourceDisplayPath = relativePath(cwd, sourcePath);
		if (!isPathInside(cwd, sourcePath, useCaseSensitiveFileNames)) {
			throw refusingCopySource(
				sourceDisplayPath,
				"it is outside the current working directory",
			);
		}

		const sourceStat = lstatIfExists(sourcePath);
		if (sourceStat === undefined) {
			throw refusingCopySource(sourceDisplayPath, "it does not exist");
		}
		if (sourceStat.isSymbolicLink()) {
			throw refusingCopySource(sourceDisplayPath, "it is a symbolic link");
		}
		if (!sourceStat.isFile()) {
			throw refusingCopySource(sourceDisplayPath, "it is not a regular file");
		}

		const sourceRealPath = realpath(sourcePath);
		const realCwd = realpath(cwd);
		if (!isPathInside(realCwd, sourceRealPath, useCaseSensitiveFileNames)) {
			throw refusingCopySource(
				sourceDisplayPath,
				"its real path is outside the current working directory",
			);
		}

		for (const root of roots) {
			if (
				isPathInside(root.path, sourcePath, useCaseSensitiveFileNames) ||
				isPathInside(root.path, sourceRealPath, useCaseSensitiveFileNames)
			) {
				throw refusingCopySource(
					sourceDisplayPath,
					`it is inside ${root.name} '${relativePath(cwd, root.path)}'`,
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
export function applyCopy(plan: CopyPlan, { dry }: { dry: boolean }): void {
	if (dry) {
		return;
	}

	for (const verdict of plan) {
		if (verdict.type === "copyFile") {
			fs.mkdirSync(path.dirname(verdict.destinationPath), { recursive: true });
			fs.copyFileSync(verdict.sourcePath, verdict.destinationPath);
		}
	}
}

function assertDestinationsDoNotConflict(
	destinationPaths: readonly string[],
	outputPaths: ReadonlySet<string>,
	outDir: string,
	useCaseSensitiveFileNames: boolean,
	cwd: string,
): void {
	const normalizedOutputPaths = new Set(
		[...outputPaths].map((outputPath) =>
			normalizePathForComparison(outputPath, useCaseSensitiveFileNames),
		),
	);
	const normalizedOutputAncestorPaths = new Set(
		[...outputPaths].flatMap((outputPath) =>
			normalizedAncestorDirPaths(outputPath, outDir, useCaseSensitiveFileNames),
		),
	);
	const normalizedDestinations = new Set<string>();
	const normalizedDestinationAncestorPaths = new Set<string>();

	for (const destinationPath of destinationPaths) {
		const normalizedDestinationPath = normalizePathForComparison(
			destinationPath,
			useCaseSensitiveFileNames,
		);
		const normalizedAncestors = normalizedAncestorDirPaths(
			destinationPath,
			outDir,
			useCaseSensitiveFileNames,
		);

		if (normalizedDestinations.has(normalizedDestinationPath)) {
			throw refusingCopyTo(
				relativePath(cwd, destinationPath),
				"it is shared with another copy entry",
			);
		}
		if (
			normalizedDestinationAncestorPaths.has(normalizedDestinationPath) ||
			normalizedAncestors.some((ancestorPath) =>
				normalizedDestinations.has(ancestorPath),
			)
		) {
			throw refusingCopyTo(
				relativePath(cwd, destinationPath),
				"it is nested with another copy destination",
			);
		}

		const isOutput = normalizedOutputPaths.has(normalizedDestinationPath);
		if (
			isOutput ||
			normalizedOutputAncestorPaths.has(normalizedDestinationPath) ||
			normalizedAncestors.some((ancestorPath) =>
				normalizedOutputPaths.has(ancestorPath),
			)
		) {
			throw refusingCopyTo(
				relativePath(cwd, destinationPath),
				isOutput
					? "it is an output of the project"
					: "it overlaps an output of the project",
			);
		}

		normalizedDestinations.add(normalizedDestinationPath);
		for (const ancestorPath of normalizedAncestors) {
			normalizedDestinationAncestorPaths.add(ancestorPath);
		}
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
