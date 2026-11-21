import path from "node:path";
import ts from "typescript";

export function isPathInside(dirPath: string, filePath: string): boolean {
	const normalizedDirPath = ts.sys.useCaseSensitiveFileNames
		? dirPath
		: dirPath.toLowerCase();
	const normalizedFilePath = ts.sys.useCaseSensitiveFileNames
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
