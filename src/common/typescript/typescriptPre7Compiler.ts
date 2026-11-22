import ts from "typescript";

import type { Compiler, ParsedProject } from "./compiler.ts";

import { UserError } from "../errors.ts";
import {
	TYPESCRIPT_4_0,
	TYPESCRIPT_4_2,
	typescriptVersion,
} from "./version.ts";

type ConfigFileMetadata = Pick<
	ts.TsConfigSourceFile,
	"extendedSourceFiles" | "fileName"
>;

/** Uses the `typescript` API for TypeScript 3.9 through 6.x. */
export class TypeScriptPre7Compiler implements Compiler {
	readonly useCaseSensitiveFileNames: boolean;

	constructor() {
		this.useCaseSensitiveFileNames = ts.sys.useCaseSensitiveFileNames;
	}

	close(): void {
		// The TypeScript API has no resources to dispose.
	}

	parseProject(configFilePath: string): ParsedProject {
		const parsedCommandLine = parseCommandLine(configFilePath);
		const program = ts.createProgram(
			parsedCommandLine.fileNames,
			parsedCommandLine.options,
		);
		const sourceFileNames = program
			.getSourceFiles()
			.filter(
				(sourceFile) =>
					!program.isSourceFileDefaultLibrary(sourceFile) &&
					!program.isSourceFileFromExternalLibrary(sourceFile),
			)
			.map((sourceFile) => sourceFile.fileName);

		return {
			getOutputPaths: () =>
				this.getOutputPaths(parsedCommandLine, sourceFileNames),
			options: parsedCommandLine.options,
			sourceFileNames,
		};
	}

	private getOutputPaths(
		parsedCommandLine: ts.ParsedCommandLine,
		sourceFileNames: string[],
	): Set<string> {
		if (
			typescriptVersion < TYPESCRIPT_4_2 &&
			parsedCommandLine.options.rootDir === undefined
		) {
			throw new UserError(
				"Refusing to clean outDir: TypeScript 3.9 through 4.1 require rootDir to be set.",
			);
		}

		const emittableFileNames = sourceFileNames.filter(
			(fileName) => !isDeclarationFileName(fileName),
		);
		if (
			typescriptVersion < TYPESCRIPT_4_0 &&
			parsedCommandLine.options.emitDeclarationOnly === true &&
			parsedCommandLine.options.resolveJsonModule === true &&
			emittableFileNames.some((fileName) => fileName.endsWith(".json"))
		) {
			throw new UserError(
				"Refusing to clean outDir: TypeScript 3.9 cannot safely determine outputs for emitDeclarationOnly with resolveJsonModule.",
			);
		}
		if (
			typescriptVersion < TYPESCRIPT_4_0 &&
			parsedCommandLine.options.allowJs === true &&
			parsedCommandLine.options.jsx === ts.JsxEmit.Preserve &&
			parsedCommandLine.options.declaration === true &&
			emittableFileNames.some((fileName) => fileName.endsWith(".jsx"))
		) {
			throw new UserError(
				"Refusing to clean outDir: TypeScript 3.9 cannot safely determine outputs for allowJs JSX preserve with declaration.",
			);
		}

		const outputCommandLine = {
			...parsedCommandLine,
			fileNames: emittableFileNames,
		};
		const outputPaths = new Set<string>();
		for (const fileName of emittableFileNames) {
			for (const outputPath of ts.getOutputFileNames(
				outputCommandLine,
				fileName,
				!this.useCaseSensitiveFileNames,
			)) {
				outputPaths.add(outputPath);
			}
		}

		return outputPaths;
	}
}

function isConfigFileMetadata(value: unknown): value is ConfigFileMetadata {
	if (
		typeof value !== "object" ||
		value === null ||
		!("fileName" in value) ||
		typeof value.fileName !== "string"
	) {
		return false;
	}

	if (
		"extendedSourceFiles" in value &&
		value.extendedSourceFiles !== undefined
	) {
		return (
			Array.isArray(value.extendedSourceFiles) &&
			value.extendedSourceFiles.every(
				(fileName: unknown) => typeof fileName === "string",
			)
		);
	}

	return true;
}

function isDeclarationFileName(fileName: string): boolean {
	return (
		fileName.endsWith(".d.ts") ||
		fileName.endsWith(".d.mts") ||
		fileName.endsWith(".d.cts")
	);
}

function parseCommandLine(configFilePath: string): ts.ParsedCommandLine {
	const formatHost: ts.FormatDiagnosticsHost = {
		getCanonicalFileName: (fileName) => fileName,
		getCurrentDirectory: () => process.cwd(),
		getNewLine: () => ts.sys.newLine,
	};
	const checkConfigFile = (filePath: string) => {
		const config = ts.readConfigFile(filePath.replaceAll("\\", "/"), (name) =>
			ts.sys.readFile(name),
		);
		if (config.error !== undefined) {
			throw new UserError(
				ts.formatDiagnostics([config.error], formatHost).trimEnd(),
			);
		}
	};
	checkConfigFile(configFilePath);
	const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
		configFilePath,
		undefined,
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new UserError(
					ts.formatDiagnostics([diagnostic], formatHost).trimEnd(),
				);
			},
		},
	);

	if (parsedCommandLine === undefined) {
		throw new UserError("Could not read tsconfig.json.");
	}

	if (parsedCommandLine.errors.length > 0) {
		throw new UserError(
			ts.formatDiagnostics(parsedCommandLine.errors, formatHost).trimEnd(),
		);
	}

	const configFileOption = parsedCommandLine.options["configFile"];
	const configFile = isConfigFileMetadata(configFileOption)
		? configFileOption
		: undefined;
	for (const filePath of configFile?.extendedSourceFiles ?? []) {
		checkConfigFile(filePath);
	}

	return parsedCommandLine;
}
