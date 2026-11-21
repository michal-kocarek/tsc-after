export interface Compiler {
	close(): void;
	getOutputPaths(project: Project): Set<string>;
	parseProject(configFilePath: string): Project;
	readonly useCaseSensitiveFileNames: boolean;
}

export interface CompilerOptions {
	composite?: boolean;
	declarationDir?: string;
	incremental?: boolean;
	noEmit?: boolean;
	outDir?: string;
	project?: string;
	tsBuildInfoFile?: string;
}

export interface Project {
	configFilePaths: string[];
	fileNames: string[];
	hasWatchOptions: boolean;
	options: CompilerOptions;
}
