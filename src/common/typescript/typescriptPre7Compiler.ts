import ts from "typescript";

import type { Compiler, Project } from "./compiler.ts";

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
	private readonly parsedCommandLines = new WeakMap<
		Project,
		ts.ParsedCommandLine
	>();

	constructor() {
		this.useCaseSensitiveFileNames = ts.sys.useCaseSensitiveFileNames;
	}

	close(): void {
		// The TypeScript API has no resources to dispose.
	}

	getOutputPaths(project: Project): Set<string> {
		const parsedCommandLine = this.parsedCommandLines.get(project);
		if (parsedCommandLine === undefined) {
			throw new Error("Project was not parsed by this compiler.");
		}

		if (
			typescriptVersion < TYPESCRIPT_4_2 &&
			parsedCommandLine.options.rootDir === undefined
		) {
			throw new UserError(
				"Refusing to clean outDir: TypeScript 3.9 through 4.1 require rootDir to be set.",
			);
		}

		const emittableFileNames = project.programFileNames.filter(
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

	parseProject(configFilePath: string): Project {
		const formatHost: ts.FormatDiagnosticsHost = {
			getCanonicalFileName: (fileName) => fileName,
			getCurrentDirectory: () => process.cwd(),
			getNewLine: () => ts.sys.newLine,
		};
		const checkConfigFile = (filePath: string) => {
			const config = ts.readConfigFile(filePath, (name) =>
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
		const program = ts.createProgram(
			parsedCommandLine.fileNames,
			parsedCommandLine.options,
		);
		const project: Project = {
			configFilePath: configFile?.fileName ?? configFilePath,
			fileNames: parsedCommandLine.fileNames,
			options: parsedCommandLine.options,
			programFileNames: program
				.getSourceFiles()
				.filter(
					(sourceFile) =>
						!program.isSourceFileDefaultLibrary(sourceFile) &&
						!program.isSourceFileFromExternalLibrary(sourceFile),
				)
				.map((sourceFile) => sourceFile.fileName),
		};

		this.parsedCommandLines.set(project, parsedCommandLine);
		return project;
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
