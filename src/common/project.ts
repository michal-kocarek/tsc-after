import fs from "node:fs";
import path from "node:path";

import type { Compiler, ParsedProject } from "./typescript/compiler.ts";

import { UserError } from "./errors.ts";
import { isPathInside } from "./paths.ts";
import { loadCompiler } from "./typescript/loadCompiler.ts";

const OUTSIDE_CWD_ERROR =
	"Refusing to traverse outside current working directory to read tsconfig!";
const NO_EMIT_ERROR = "Refusing to clean outDir because noEmit is enabled.";
const MISSING_OUT_DIR_ERROR =
	'outDir is not set in tsconfig.json; tsc-after only cleans a dedicated outDir. Set compilerOptions.outDir, e.g. "dist".';
const DECLARATION_DISABLED_ERROR =
	"Refusing to clean declarationDir because declaration is not enabled.";

export interface Project {
	configFilePath: string;
	declarationDir: string | undefined;
	outDir: string;
	outputPaths: ReadonlySet<string>;
	sourceFileNames: readonly string[];
	useCaseSensitiveFileNames: boolean;
}

/**
 * Loads the project selected by `--project`, refusing configurations whose
 * outputs cannot be derived reliably.
 */
export async function loadProject(
	projectPath: string,
	cwd: string,
): Promise<Project> {
	const compiler = await loadCompiler();
	try {
		const configFilePath = resolveConfigFilePath(compiler, projectPath, cwd);
		const parsedProject = compiler.parseProject(configFilePath);
		const { declarationDir, outDir } = resolveOutputDirs(parsedProject, cwd);

		return {
			configFilePath,
			declarationDir,
			outDir,
			outputPaths: parsedProject.getOutputPaths(),
			sourceFileNames: parsedProject.sourceFileNames,
			useCaseSensitiveFileNames: compiler.useCaseSensitiveFileNames,
		};
	} finally {
		compiler.close();
	}
}

function resolveConfigFilePath(
	compiler: Compiler,
	projectPath: string,
	cwd: string,
): string {
	const isInsideCwd = (filePath: string) =>
		isPathInside(cwd, filePath, compiler.useCaseSensitiveFileNames);
	const projectAbsolutePath = path.resolve(cwd, projectPath);
	if (!isInsideCwd(projectAbsolutePath)) {
		throw new UserError(OUTSIDE_CWD_ERROR);
	}

	const configFilePath =
		fs.existsSync(projectAbsolutePath) &&
		fs.statSync(projectAbsolutePath).isDirectory()
			? path.join(projectAbsolutePath, "tsconfig.json")
			: projectAbsolutePath;
	if (
		!isInsideCwd(configFilePath) ||
		isPathInside(configFilePath, cwd, compiler.useCaseSensitiveFileNames)
	) {
		throw new UserError(OUTSIDE_CWD_ERROR);
	}

	return configFilePath;
}

function resolveOutputDirs(
	{ options }: ParsedProject,
	cwd: string,
): Pick<Project, "declarationDir" | "outDir"> {
	if (options.noEmit === true) {
		throw new UserError(NO_EMIT_ERROR);
	}
	if (options.outFile !== undefined) {
		throw new UserError("outFile is not supported");
	}
	if (options.project !== undefined) {
		throw new UserError("Project mode is not supported");
	}
	if (options.outDir === undefined) {
		throw new UserError(MISSING_OUT_DIR_ERROR);
	}
	if (
		options.declarationDir !== undefined &&
		options.declaration !== true &&
		options.composite !== true
	) {
		throw new UserError(DECLARATION_DISABLED_ERROR);
	}

	return {
		declarationDir:
			options.declarationDir === undefined
				? undefined
				: path.resolve(cwd, options.declarationDir),
		outDir: path.resolve(cwd, options.outDir),
	};
}
