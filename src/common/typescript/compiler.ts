export interface Compiler {
	close(): void;
	parseProject(configFilePath: string): ParsedProject;
	readonly useCaseSensitiveFileNames: boolean;
}

export interface ParsedProject {
	getOutputPaths(): Set<string>;
	options: CompilerOptions;
	sourceFileNames: string[];
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
