import path from "node:path";

// Inspired by the TypeScript native compiler's output-path rules; cross-check
// its GetOutputPathsFor and GetCommonSourceDirectory implementations here:
// https://github.com/microsoft/TypeScript/blob/01f1a759d92b19ea7024776da02358995d56a7ff/tsc/internal/outputpaths/outputpaths.go
// https://github.com/microsoft/TypeScript/blob/01f1a759d92b19ea7024776da02358995d56a7ff/tsc/internal/outputpaths/commonsourcedirectory.go
// The supported TS 7 layouts must match tsc --listEmittedFiles, as checked by
// src/__tests__/emittedLayouts.e2e.test.ts. This is not a general emit API.
export interface OutputOptions {
	allowJs?: boolean | undefined;
	composite?: boolean | undefined;
	configFilePath: string;
	declaration?: boolean | undefined;
	declarationDir?: string | undefined;
	declarationMap?: boolean | undefined;
	emitDeclarationOnly?: boolean | undefined;
	jsx?: string | undefined;
	outDir?: string | undefined;
	rootDir?: string | undefined;
	sourceMap?: boolean | undefined;
}

const declarationFileExtensions = [".d.ts", ".d.mts", ".d.cts"];
const esmFileExtensions = [".mts", ".mjs"];
const cjsFileExtensions = [".cts", ".cjs"];

export function getOutputFileNames(
	options: OutputOptions,
	fileName: string,
): string[] {
	const sourcePath = path.resolve(fileName);
	const sourceExtension = path.extname(sourcePath);
	if (isDeclarationFile(sourcePath)) {
		return [];
	}

	const isJsonFile = sourceExtension === ".json";
	const isJavaScriptFile =
		sourceExtension === ".js" ||
		sourceExtension === ".jsx" ||
		sourceExtension === ".mjs" ||
		sourceExtension === ".cjs";
	if (isJavaScriptFile && options.allowJs !== true) {
		return [];
	}

	const outputFileNames: string[] = [];
	const outputDirectory = resolveOptionPath(
		options.outDir,
		options.configFilePath,
	);
	const outputPath = getOutputPath(
		sourcePath,
		outputDirectory,
		options.rootDir,
		options.configFilePath,
	);

	if (isJsonFile) {
		if (options.emitDeclarationOnly !== true) {
			outputFileNames.push(outputPath);
		}
		return outputFileNames;
	}

	const javaScriptExtension = getJavaScriptExtension(
		sourceExtension,
		options.jsx,
	);
	if (javaScriptExtension === undefined) {
		return [];
	}

	if (options.emitDeclarationOnly !== true) {
		const javaScriptPath = replaceExtension(outputPath, javaScriptExtension);
		outputFileNames.push(javaScriptPath);
		if (options.sourceMap === true) {
			outputFileNames.push(`${javaScriptPath}.map`);
		}
	}

	if (options.declaration === true || options.composite === true) {
		const declarationDirectory = resolveOptionPath(
			options.declarationDir ?? options.outDir,
			options.configFilePath,
		);
		const declarationPath = replaceExtension(
			getOutputPath(
				sourcePath,
				declarationDirectory,
				options.rootDir,
				options.configFilePath,
			),
			getDeclarationExtension(sourceExtension),
		);
		outputFileNames.push(declarationPath);
		if (options.declarationMap === true) {
			outputFileNames.push(`${declarationPath}.map`);
		}
	}

	return outputFileNames;
}

function getDeclarationExtension(sourceExtension: string): string {
	if (esmFileExtensions.includes(sourceExtension)) {
		return ".d.mts";
	}
	if (cjsFileExtensions.includes(sourceExtension)) {
		return ".d.cts";
	}
	return ".d.ts";
}

function getJavaScriptExtension(
	sourceExtension: string,
	jsx: string | undefined,
): string | undefined {
	if (sourceExtension === ".tsx" || sourceExtension === ".jsx") {
		return jsx === "preserve" ? ".jsx" : ".js";
	}
	if (sourceExtension === ".ts" || sourceExtension === ".js") {
		return ".js";
	}
	if (sourceExtension === ".mts") {
		return ".mjs";
	}
	if (sourceExtension === ".cts") {
		return ".cjs";
	}
	if (sourceExtension === ".mjs" || sourceExtension === ".cjs") {
		return sourceExtension;
	}
	return undefined;
}

function getOutputPath(
	sourcePath: string,
	outputDirectory: string | undefined,
	rootDir: string | undefined,
	configFilePath: string,
): string {
	if (outputDirectory === undefined) {
		return sourcePath;
	}

	const resolvedRootDir = path.resolve(
		path.dirname(configFilePath),
		rootDir ?? ".",
	);
	return path.resolve(
		outputDirectory,
		path.relative(resolvedRootDir, sourcePath),
	);
}

function isDeclarationFile(fileName: string): boolean {
	return (
		declarationFileExtensions.some((extension) =>
			fileName.endsWith(extension),
		) || /\.d\..+\.ts$/u.test(path.basename(fileName))
	);
}

function replaceExtension(fileName: string, extension: string): string {
	return `${fileName.slice(0, -path.extname(fileName).length)}${extension}`;
}

function resolveOptionPath(
	optionPath: string | undefined,
	configFilePath: string,
): string | undefined {
	return optionPath === undefined
		? undefined
		: path.resolve(path.dirname(configFilePath), optionPath);
}
