import fs from "node:fs";
import path from "node:path";

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
			normalizedDirPath.endsWith(path.sep)
				? normalizedDirPath
				: `${normalizedDirPath}${path.sep}`,
		)
	);
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

/**
 * Uses the native realpath implementation to match TypeScript's canonical
 * paths, including Windows 8.3 names and junctions.
 */
export function realpath(filePath: string): string {
	return fs.realpathSync.native(filePath);
}
