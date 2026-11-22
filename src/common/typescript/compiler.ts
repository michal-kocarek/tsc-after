export interface Compiler {
	close(): void;
	getOutputPaths(project: Project): Set<string>;
	parseProject(configFilePath: string): Project;
	readonly useCaseSensitiveFileNames: boolean;
}

export interface Project {
	configFilePath: string;
	fileNames: string[];
	options: CompilerOptions;
	programFileNames: string[];
}

interface CompilerOptions {
	composite?: boolean | undefined;
	declaration?: boolean | undefined;
	declarationDir?: string | undefined;
	incremental?: boolean | undefined;
	noEmit?: boolean | undefined;
	outDir?: string | undefined;
	outFile?: string | undefined;
	project?: string | undefined;
	tsBuildInfoFile?: string | undefined;
}
