import type * as TypeScript7Sync from "typescript-7/sync";

import fs from "node:fs";
import path from "node:path";

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
		const typescriptSync = (await import(
			syncModuleSpecifier
		)) as unknown as typeof TypeScript7Sync;
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
		const configFilePath = project.configFilePaths[0];
		if (configFilePath === undefined) {
			throw new Error("Project has no config file path.");
		}

		const outputOptions = {
			...config.options,
			configFilePath,
			jsx:
				config.options.jsx === this.typescriptSync.JsxEmit.Preserve
					? "preserve"
					: undefined,
		} as OutputOptions;
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

		const config = this.api.parseConfigFile(configFilePath);
		if (config.errors.length > 0) {
			throw new UserError(
				this.typescriptSync
					.formatDiagnosticsWithColorAndContext(config.errors, this.api)
					.trimEnd(),
			);
		}

		const extendedConfigInfo = getExtendedConfigInfo(
			this.api,
			configFilePath,
			config.raw ?? this.api.readConfigFile(configFilePath).config,
		);
		const project: Project = {
			configFilePaths: extendedConfigInfo.configFilePaths,
			fileNames: config.fileNames,
			hasWatchOptions: extendedConfigInfo.hasWatchOptions,
			options: config.options,
		};
		this.projects.set(project, config);
		return project;
	}

	private assertOpen(): void {
		if (this.isClosed) {
			throw new Error("Compiler is closed.");
		}
	}
}

function getExtendedConfigInfo(
	api: InstanceType<typeof TypeScript7Sync.API>,
	configFilePath: string,
	rootConfig: unknown,
): { configFilePaths: string[]; hasWatchOptions: boolean } {
	const configFilePaths = new Set<string>();
	let hasWatchOptions = false;

	function visit(currentConfigFilePath: string, rawConfig: unknown): void {
		const normalizedConfigFilePath = path.resolve(currentConfigFilePath);
		if (configFilePaths.has(normalizedConfigFilePath)) {
			return;
		}

		configFilePaths.add(normalizedConfigFilePath);

		if (typeof rawConfig !== "object" || rawConfig === null) {
			throw new UserError(
				`Could not safely read TypeScript config '${normalizedConfigFilePath}'.`,
			);
		}

		const rawConfigRecord = rawConfig as Record<string, unknown>;
		hasWatchOptions ||= rawConfigRecord["watchOptions"] !== undefined;

		const extendsValue = rawConfigRecord["extends"];
		if (extendsValue === undefined) {
			return;
		}

		const extendedConfigPaths = Array.isArray(extendsValue)
			? extendsValue
			: [extendsValue];
		for (const extendedConfigPath of extendedConfigPaths) {
			if (typeof extendedConfigPath !== "string") {
				throw new UserError(
					`Could not safely determine extended config paths for '${normalizedConfigFilePath}'.`,
				);
			}

			const resolvedConfigPath = resolveExtendedConfigPath(
				normalizedConfigFilePath,
				extendedConfigPath,
			);
			const extendedConfig = api.readConfigFile(resolvedConfigPath).config;
			visit(resolvedConfigPath, extendedConfig);
		}
	}

	visit(configFilePath, rootConfig);

	return {
		configFilePaths: [...configFilePaths],
		hasWatchOptions,
	};
}

function resolveExtendedConfigPath(
	configFilePath: string,
	extendsSpecifier: string,
): string {
	const specifier = extendsSpecifier.replaceAll("\\", "/");
	if (
		path.isAbsolute(specifier) ||
		specifier.startsWith("./") ||
		specifier.startsWith("../")
	) {
		const basePath = path.resolve(path.dirname(configFilePath), specifier);
		for (const candidatePath of [basePath, `${basePath}.json`]) {
			try {
				if (fs.statSync(candidatePath).isFile()) {
					return candidatePath;
				}
			} catch {
				// Try the next candidate.
			}
		}
	}

	throw new UserError(
		`Could not safely determine extended config '${extendsSpecifier}' from '${configFilePath}'.`,
	);
}
