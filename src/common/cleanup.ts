import fs from "node:fs";
import path from "node:path";

import type { Project } from "./project.ts";

import { assertUnreachable, isNodeErrorOf, UserError } from "./errors.ts";
import {
	isPathInside,
	lstatIfExists,
	normalizedAncestorDirPaths,
	normalizePathForComparison,
	realpath,
} from "./paths.ts";

export type CleanupPlan = readonly RootCleanup[];

export interface CleanupRoot {
	name: "declarationDir" | "outDir";
	path: string;
	relativePath: string;
}

interface RootCleanup {
	root: CleanupRoot;
	verdicts: readonly Verdict[];
}

type Verdict =
	| { path: string; reason: string; type: "skipped" }
	| { path: string; type: "removeDir" }
	| { path: string; type: "removeFile" };

/**
 * Plans the removal of stale outputs from each cleanup root without changing
 * anything, refusing roots that are unsafe to clean.
 * A path inside outDir always belongs to outDir, even when outDir is nested in
 * declarationDir.
 */
export function planCleanup(
	project: Pick<
		Project,
		| "declarationDir"
		| "outDir"
		| "outputPaths"
		| "sourceFileNames"
		| "useCaseSensitiveFileNames"
	>,
	roots: readonly CleanupRoot[],
	copyDestinations: readonly string[],
): CleanupPlan {
	const { outDir, useCaseSensitiveFileNames } = project;
	const normalizedOutputPaths = new Set(
		[...project.outputPaths].map((filePath) =>
			normalizePathForComparison(filePath, useCaseSensitiveFileNames),
		),
	);
	const normalizedCopyDestinations = new Set(
		copyDestinations.map((filePath) =>
			normalizePathForComparison(filePath, useCaseSensitiveFileNames),
		),
	);
	const normalizedCopyDestinationDirs = new Set(
		copyDestinations.flatMap((filePath) =>
			normalizedAncestorDirPaths(filePath, outDir, useCaseSensitiveFileNames),
		),
	);
	const isCopyDestinationDir = (dirPath: string) =>
		normalizedCopyDestinationDirs.has(
			normalizePathForComparison(dirPath, useCaseSensitiveFileNames),
		);
	const getKeepReason = (filePath: string) => {
		const normalizedPath = normalizePathForComparison(
			filePath,
			useCaseSensitiveFileNames,
		);
		if (normalizedCopyDestinations.has(normalizedPath)) {
			return "copy destination";
		}
		if (normalizedOutputPaths.has(normalizedPath)) {
			return "expected output file";
		}
		return undefined;
	};

	let outDirIsRemoved = false;
	const plan: RootCleanup[] = [];
	for (const root of roots) {
		const verdicts = readCleanupRoot(root.path, {
			getKeepReason,
			isCopyDestinationDir,
			isDirOwnedElsewhere: (dirPath) => {
				if (
					root.name === "outDir" ||
					!isPathInside(outDir, dirPath, useCaseSensitiveFileNames)
				) {
					return undefined;
				}
				return outDirIsRemoved;
			},
		});
		if (root.name === "outDir") {
			outDirIsRemoved = verdicts.some(
				(verdict) => verdict.type === "removeDir" && verdict.path === root.path,
			);
		}
		plan.push({ root, verdicts });
	}

	return plan;
}

/**
 * Removes what the plan marks for removal, contents before their directories.
 * Returns the plan's verdicts, with a busy cleanup root reported as skipped.
 */
export function applyCleanup(
	plan: CleanupPlan,
	{ dry }: { dry: boolean },
): CleanupPlan {
	return plan.map(({ root, verdicts }) => ({
		root,
		verdicts: verdicts.map((verdict): Verdict => {
			if (dry) {
				return verdict;
			}
			switch (verdict.type) {
				case "removeDir":
					try {
						fs.rmdirSync(verdict.path);
					} catch (error) {
						if (
							verdict.path === root.path &&
							isNodeErrorOf(error, Error, "EBUSY")
						) {
							return {
								path: verdict.path,
								reason: "busy directory",
								type: "skipped",
							};
						}
						throw error;
					}
					return verdict;
				case "removeFile":
					fs.rmSync(verdict.path, { recursive: false });
					return verdict;
				case "skipped":
					return verdict;
				default:
					return assertUnreachable(verdict);
			}
		}),
	}));
}

function notADirectoryError(root: CleanupRoot, componentPath: string): string {
	return `Refusing to clean ${root.name} '${root.relativePath}': '${componentPath}' is not a directory.`;
}

/**
 * Walks a cleanup root, listing contents before their directory.
 * `isDirOwnedElsewhere` returns `undefined` for a directory this root owns, or
 * whether another root's plan removes it.
 */
interface CleanupReadOptions {
	getKeepReason: (filePath: string) => string | undefined;
	isCopyDestinationDir: (dirPath: string) => boolean;
	isDirOwnedElsewhere: (dirPath: string) => boolean | undefined;
}

export function resolveCleanupRoots(
	project: Pick<
		Project,
		| "declarationDir"
		| "outDir"
		| "sourceFileNames"
		| "useCaseSensitiveFileNames"
	>,
	cwd: string,
): CleanupRoot[] {
	const { declarationDir, outDir, useCaseSensitiveFileNames } = project;
	const roots: CleanupRoot[] = [
		{
			name: "outDir",
			path: outDir,
			relativePath: path.relative(cwd, outDir),
		},
	];
	if (declarationDir !== undefined) {
		roots.push({
			name: "declarationDir",
			path: declarationDir,
			relativePath: path.relative(cwd, declarationDir),
		});
	}

	for (const root of roots) {
		if (
			!isPathInside(cwd, root.path, useCaseSensitiveFileNames) ||
			isPathInside(root.path, cwd, useCaseSensitiveFileNames)
		) {
			throw new UserError(
				`Refusing to traverse outside safe paths containing tsconfig to process ${root.name}!`,
			);
		}

		let componentPath = cwd;
		for (const component of root.relativePath.split(path.sep)) {
			componentPath = path.join(componentPath, component);
			const stat = lstatIfExists(componentPath);
			if (stat === undefined) {
				break;
			}
			if (stat.isSymbolicLink()) {
				throw new UserError(
					`Refusing to clean ${root.name} through a symbolic link: ${root.relativePath}!`,
				);
			}
			if (!stat.isDirectory()) {
				throw new UserError(
					notADirectoryError(root, path.relative(cwd, componentPath)),
				);
			}
		}

		for (const file of project.sourceFileNames) {
			const filePath = path.resolve(cwd, file);
			let realFilePath = filePath;
			try {
				realFilePath = realpath(filePath);
			} catch (error) {
				if (!isNodeErrorOf(error, Error, "ENOENT")) {
					throw error;
				}
			}
			if (
				isPathInside(root.path, filePath, useCaseSensitiveFileNames) ||
				isPathInside(root.path, realFilePath, useCaseSensitiveFileNames)
			) {
				throw new UserError(
					`Refusing to clean ${root.name} '${root.relativePath}': it contains source file '${path.relative(cwd, file)}'.`,
				);
			}
		}
	}

	return roots.filter(
		(root) =>
			root.name === "outDir" ||
			!isPathInside(outDir, root.path, useCaseSensitiveFileNames),
	);
}

function readCleanupRoot(
	rootPath: string,
	{
		getKeepReason,
		isCopyDestinationDir,
		isDirOwnedElsewhere,
	}: CleanupReadOptions,
): Verdict[] {
	if (lstatIfExists(rootPath) === undefined) {
		return [];
	}

	return readDir(rootPath);

	function readDir(dirPath: string): Verdict[] {
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
				verdicts.push({
					path: fullPath,
					reason: "different device",
					type: "skipped",
				});
				dirIsEmpty = false;
				continue;
			}

			if (fullPathStat.isSymbolicLink()) {
				verdicts.push({
					path: fullPath,
					reason: "symbolic link",
					type: "skipped",
				});
				dirIsEmpty = false;
				continue;
			}

			if (fullPathStat.isFile()) {
				const keepReason = getKeepReason(fullPath);
				if (keepReason !== undefined) {
					verdicts.push({
						path: fullPath,
						reason: keepReason,
						type: "skipped",
					});
					dirIsEmpty = false;
					continue;
				}

				verdicts.push({ path: fullPath, type: "removeFile" });
				continue;
			}

			if (fullPathStat.isDirectory()) {
				const isRemovedElsewhere = isDirOwnedElsewhere(fullPath);
				if (isRemovedElsewhere !== undefined) {
					if (!isRemovedElsewhere) {
						dirIsEmpty = false;
					}
					continue;
				}
				const childVerdicts = readDir(fullPath);
				verdicts.push(...childVerdicts);
				if (childVerdicts.some((verdict) => verdict.type === "skipped")) {
					dirIsEmpty = false;
				}
				continue;
			}

			verdicts.push({
				path: fullPath,
				reason: "unknown file type",
				type: "skipped",
			});
			dirIsEmpty = false;
		}

		if (isCopyDestinationDir(dirPath)) {
			verdicts.push({
				path: dirPath,
				reason: "copy destination directory",
				type: "skipped",
			});
		} else if (dirIsEmpty) {
			verdicts.push({ path: dirPath, type: "removeDir" });
		} else {
			verdicts.push({
				path: dirPath,
				reason: "directory not empty",
				type: "skipped",
			});
		}

		return verdicts;
	}
}
