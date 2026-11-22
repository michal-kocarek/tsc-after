import type * as TypeScript7Sync from "typescript-7/sync";

import fs from "node:fs";

import type { Compiler, Project } from "./compiler.ts";

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
	private cachedProject: Project | undefined;
	private isClosed = false;
	private program: TypeScript7Sync.Program | undefined;
	private readonly projects = new WeakMap<
		Project,
		TypeScript7Sync.ParsedCommandLine
	>();
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
		if (this.isClosed) {
			return;
		}

		this.isClosed = true;
		const program = this.program;
		this.program = undefined;
		this.cachedProject = undefined;
		try {
			program?.dispose();
		} finally {
			this.api.close();
		}
	}

	getOutputPaths(project: Project): Set<string> {
		this.assertOpen();
		const config = this.projects.get(project);
		if (config === undefined) {
			throw new Error("Project was not parsed by this compiler.");
		}

		if (this.cachedProject !== project) {
			const previousProgram = this.program;
			this.program = undefined;
			this.cachedProject = undefined;
			previousProgram?.dispose();
			this.program = this.api.createProgram(config.fileNames, config.options);
			this.cachedProject = project;
		}

		const program = this.program;
		if (program === undefined) {
			throw new Error("Could not create TypeScript program.");
		}
		const configFilePath = project.configFilePath;

		const outputOptions: OutputOptions = {
			...config.options,
			configFilePath,
			jsx:
				config.options.jsx === this.typescriptSync.JsxEmit.Preserve
					? "preserve"
					: undefined,
		};
		const outputPaths = program
			.getSourceFileNames()
			.filter((fileName) => {
				const metadata = program.getSourceFileMetadata(fileName);
				return (
					metadata !== undefined &&
					!metadata.isDefaultLibrary &&
					!metadata.isFromExternalLibrary
				);
			})
			.flatMap((fileName) => getOutputFileNames(outputOptions, fileName));

		return new Set(outputPaths);
	}

	parseProject(configFilePath: string): Project {
		this.assertOpen();
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
		const project: Project = {
			configFilePath,
			fileNames: config.fileNames,
			options: config.options,
			programFileNames: program.getSourceFileNames().filter((fileName) => {
				const metadata = program.getSourceFileMetadata(fileName);
				return (
					metadata !== undefined &&
					!metadata.isDefaultLibrary &&
					!metadata.isFromExternalLibrary
				);
			}),
		};
		this.program?.dispose();
		this.program = program;
		this.cachedProject = project;
		this.projects.set(project, config);
		return project;
	}

	private assertOpen(): void {
		if (this.isClosed) {
			throw new Error("Compiler is closed.");
		}
	}
}

async function loadTypeScript7SyncModule(): Promise<typeof TypeScript7Sync> {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const typescriptSyncModule: typeof TypeScript7Sync = await import(
		syncModuleSpecifier
	);
	return typescriptSyncModule;
}
