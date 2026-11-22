import fs from "node:fs";
import path from "node:path";

import type { Project } from "./typescript/compiler.ts";

import { isNodeErrorOf, UserError } from "./errors.ts";
import { isPathInside } from "./paths.ts";

export const MISSING_OUT_DIR_ERROR =
	'outDir is not set in tsconfig.json; tsc-after only cleans a dedicated outDir. Set compilerOptions.outDir, e.g. "dist".';
export const DECLARATION_DISABLED_ERROR =
	"Refusing to clean declarationDir because declaration is not enabled.";

export interface CleanupRoot {
	name: "declarationDir" | "outDir";
	path: string;
	relativePath: string;
}

export type Verdict =
	| { path: string; reason: string; type: "skipped" }
	| { path: string; type: "removeDir" }
	| { path: string; type: "removeFile" };

export function readCleanupRoot(
	root: CleanupRoot,
	expectedOutputPaths: ReadonlySet<string>,
): Verdict[] {
	try {
		fs.lstatSync(root.path);
	} catch (error) {
		if (isNodeErrorOf(error, Error, "ENOENT")) {
			return [];
		}
		throw error;
	}

	return readDir(root.path);

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
				if (expectedOutputPaths.has(fullPath)) {
					verdicts.push({
						path: fullPath,
						reason: "expected output file",
						type: "skipped",
					});
					dirIsEmpty = false;
					continue;
				}

				verdicts.push({ path: fullPath, type: "removeFile" });
				continue;
			}

			if (fullPathStat.isDirectory()) {
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

		if (dirIsEmpty) {
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

export function resolveCleanupRoots(
	project: Project,
	cwd: string,
	useCaseSensitiveFileNames: boolean,
): CleanupRoot[] {
	if (project.options.outDir === undefined) {
		throw new UserError(MISSING_OUT_DIR_ERROR);
	}

	const outDirAbsolutePath = path.resolve(cwd, project.options.outDir);
	const roots: CleanupRoot[] = [
		{
			name: "outDir",
			path: outDirAbsolutePath,
			relativePath: path.relative(cwd, outDirAbsolutePath),
		},
	];
	if (project.options.declarationDir !== undefined) {
		if (project.options.declaration !== true) {
			throw new UserError(DECLARATION_DISABLED_ERROR);
		}
		const declarationDir = path.resolve(cwd, project.options.declarationDir);
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
			let stat: fs.Stats;
			try {
				stat = fs.lstatSync(componentPath);
			} catch (error) {
				if (isNodeErrorOf(error, Error, "ENOENT")) {
					break;
				}
				throw error;
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

		for (const file of project.programFileNames) {
			const filePath = path.resolve(cwd, file);
			let realFilePath = filePath;
			try {
				realFilePath = fs.realpathSync(filePath);
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
			!isPathInside(outDirAbsolutePath, root.path, useCaseSensitiveFileNames),
	);
}

function notADirectoryError(root: CleanupRoot, componentPath: string): string {
	return `Refusing to clean ${root.name} '${root.relativePath}': '${componentPath}' is not a directory.`;
}
