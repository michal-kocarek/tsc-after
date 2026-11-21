import ts from "typescript";

import type { Compiler, Project } from "./compiler.ts";

import { UserError } from "../errors.ts";

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

		const outputPaths = new Set<string>();
		for (const fileName of project.fileNames) {
			for (const outputPath of ts.getOutputFileNames(
				parsedCommandLine,
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

		const configFile = parsedCommandLine.options["configFile"] as
			ts.TsConfigSourceFile | undefined;
		const project: Project = {
			configFilePaths: [
				configFile?.fileName ?? configFilePath,
				...(configFile?.extendedSourceFiles ?? []),
			],
			fileNames: parsedCommandLine.fileNames,
			hasWatchOptions: parsedCommandLine.watchOptions !== undefined,
			options: parsedCommandLine.options,
		};

		this.parsedCommandLines.set(project, parsedCommandLine);
		return project;
	}
}
