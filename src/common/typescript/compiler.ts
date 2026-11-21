export interface Compiler {
	close(): void;
	getOutputPaths(project: Project): Set<string>;
	parseProject(configFilePath: string): Project;
	readonly useCaseSensitiveFileNames: boolean;
}

export interface CompilerOptions {
	composite?: boolean | undefined;
	declarationDir?: string | undefined;
	incremental?: boolean | undefined;
	noEmit?: boolean | undefined;
	outDir?: string | undefined;
	project?: string | undefined;
	tsBuildInfoFile?: string | undefined;
}

export interface Project {
	configFilePaths: string[];
	fileNames: string[];
	hasWatchOptions: boolean;
	options: CompilerOptions;
}
