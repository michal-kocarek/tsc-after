import fs from "node:fs";
import path from "node:path";

import { isNodeErrorOf } from "./errors.ts";

export function displayPath(cwd: string, filePath: string): string {
	return path.relative(cwd, filePath) || ".";
}

export function isPathInside(
	dirPath: string,
	filePath: string,
	useCaseSensitiveFileNames: boolean,
): boolean {
	const normalizedDirPath = normalizePathForComparison(
		dirPath,
		useCaseSensitiveFileNames,
	);
	const normalizedFilePath = normalizePathForComparison(
		filePath,
		useCaseSensitiveFileNames,
	);

	return (
		normalizedDirPath === normalizedFilePath ||
		normalizedFilePath.startsWith(
			ensureTrailingDirectorySeparator(normalizedDirPath),
		)
	);
}

export function lstatIfExists(filePath: string): fs.Stats | undefined {
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

export function normalizedAncestorDirPaths(
	filePath: string,
	rootPath: string,
	useCaseSensitiveFileNames: boolean,
): string[] {
	const normalizedRootPath = normalizePathForComparison(
		rootPath,
		useCaseSensitiveFileNames,
	);
	const rootPathPrefix = ensureTrailingDirectorySeparator(normalizedRootPath);
	const ancestorDirPaths: string[] = [];
	let dirPath: string | undefined = path.dirname(filePath);

	while (dirPath !== undefined) {
		const normalizedDirPath = normalizePathForComparison(
			dirPath,
			useCaseSensitiveFileNames,
		);
		if (
			normalizedDirPath !== normalizedRootPath &&
			!normalizedDirPath.startsWith(rootPathPrefix)
		) {
			break;
		}

		ancestorDirPaths.push(normalizedDirPath);
		if (normalizedDirPath === normalizedRootPath) {
			break;
		}

		const parentDirPath = path.dirname(dirPath);
		dirPath = parentDirPath === dirPath ? undefined : parentDirPath;
	}

	return ancestorDirPaths;
}

export function normalizePathForComparison(
	filePath: string,
	useCaseSensitiveFileNames: boolean,
): string {
	const normalizedPath = path.resolve(filePath);
	return useCaseSensitiveFileNames
		? normalizedPath
		: normalizedPath.toLowerCase();
}

function ensureTrailingDirectorySeparator(filePath: string): string {
	return filePath.endsWith(path.sep) ? filePath : `${filePath}${path.sep}`;
}

/**
 * Uses the native realpath implementation to match TypeScript's canonical
 * paths, including Windows 8.3 names and junctions.
 */
export function realpath(filePath: string): string {
	return fs.realpathSync.native(filePath);
}
