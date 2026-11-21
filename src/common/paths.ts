import path from "node:path";

export function isPathInside(
	dirPath: string,
	filePath: string,
	useCaseSensitiveFileNames: boolean,
): boolean {
	const normalizedDirPath = useCaseSensitiveFileNames
		? dirPath
		: dirPath.toLowerCase();
	const normalizedFilePath = useCaseSensitiveFileNames
		? filePath
		: filePath.toLowerCase();
	const relativePath = path.relative(normalizedDirPath, normalizedFilePath);

	return (
		relativePath === "" ||
		(!path.isAbsolute(relativePath) &&
			relativePath !== ".." &&
			!relativePath.startsWith(`..${path.sep}`))
	);
}
