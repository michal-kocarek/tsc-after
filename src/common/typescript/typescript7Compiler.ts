import type * as TypeScript7Sync from "typescript-7/sync";

import fs from "node:fs";

import type { Compiler, ParsedProject } from "./compiler.ts";

import { UserError } from "../errors.ts";
import { getOutputFileNames, type OutputOptions } from "./outputPaths.ts";

const syncModuleSpecifier = "typescript/sync";

/**
 * Uses the `typescript/sync` API for TypeScript 7.1 and later.
 * The documented synchronous client fits this synchronous compiler contract.
 */
export class TypeScript7Compiler implements Compiler {
	readonly useCaseSensitiveFileNames: boolean;
	private readonly api: InstanceType<typeof TypeScript7Sync.API>;
	private readonly typescriptSync: typeof TypeScript7Sync;

	private constructor(
		typescriptSync: typeof TypeScript7Sync,
		api: InstanceType<typeof TypeScript7Sync.API>,
	) {
		this.typescriptSync = typescriptSync;
		this.api = api;
		this.useCaseSensitiveFileNames =
			api.getCanonicalFileName("a") !== api.getCanonicalFileName("A");
	}

	static async create(): Promise<TypeScript7Compiler> {
		const typescriptSync = await loadTypeScript7SyncModule();
		const api = new typescriptSync.API();
		try {
			// Initialize the API before querying its filesystem case sensitivity.
			api.parseCommandLine([]);
			return new TypeScript7Compiler(typescriptSync, api);
		} catch (error) {
			api.close();
			throw error;
		}
	}

	close(): void {
		this.api.close();
	}

	parseProject(configFilePath: string): ParsedProject {
		try {
			fs.readFileSync(configFilePath);
		} catch {
			throw new UserError(
				`error TS5083: Cannot read file '${configFilePath}'.`,
			);
		}

		const checkDiagnostics = (diagnostics: TypeScript7Sync.Diagnostic[]) => {
			if (diagnostics.length === 0) {
				return;
			}
			throw new UserError(
				this.typescriptSync
					.formatDiagnosticsWithColorAndContext(diagnostics, {
						getCanonicalFileName: (fileName) =>
							this.api.getCanonicalFileName(fileName),
						getCurrentDirectory: () => this.api.getCurrentDirectory(),
						getNewLine: () => this.api.getNewLine(),
					})
					.trimEnd(),
			);
		};
		const checkConfigFile = (filePath: string): void => {
			const result = this.api.readConfigFile(filePath);
			if (result.error !== undefined) {
				checkDiagnostics([result.error]);
			}
		};
		checkConfigFile(configFilePath);
		const config = this.api.parseConfigFile(configFilePath);
		checkDiagnostics(config.errors);

		const program = this.api.createProgram(config.fileNames, config.options);
		let sourceFileNames: string[];
		try {
			sourceFileNames = program.getSourceFileNames().filter((fileName) => {
				const metadata = program.getSourceFileMetadata(fileName);
				return (
					metadata !== undefined &&
					!metadata.isDefaultLibrary &&
					!metadata.isFromExternalLibrary
				);
			});
		} finally {
			program.dispose();
		}

		const outputOptions: OutputOptions = {
			...config.options,
			configFilePath,
			jsx:
				config.options.jsx === this.typescriptSync.JsxEmit.Preserve
					? "preserve"
					: undefined,
		};
		return {
			getOutputPaths: () =>
				new Set(
					sourceFileNames.flatMap((fileName) =>
						getOutputFileNames(outputOptions, fileName),
					),
				),
			options: config.options,
			sourceFileNames,
		};
	}
}

async function loadTypeScript7SyncModule(): Promise<typeof TypeScript7Sync> {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const typescriptSyncModule: typeof TypeScript7Sync = await import(
		syncModuleSpecifier
	);
	return typescriptSyncModule;
}
