import path from "node:path";
import ts from "typescript";
import { describe, it } from "vitest";

import {
	getOutputFileNames,
	getTsBuildInfoEmitOutputFilePath,
} from "../outputPaths.ts";
import {
	TYPESCRIPT_6_0,
	TYPESCRIPT_7_0,
	typescriptVersion,
} from "../version.ts";

const projectDir = path.resolve("/project");
const configFilePath = path.join(projectDir, "tsconfig.json");
const outputDir = path.join(projectDir, "dist");
const parseConfigHost: ts.ParseConfigHost = {
	fileExists: () => false,
	readDirectory: () => [],
	readFile: () => undefined,
	useCaseSensitiveFileNames: true,
};

describe(getOutputFileNames, () => {
	const outputCases = [
		{
			fileName: path.join(projectDir, "src/index.ts"),
			name: "uses the default rootDir",
			options: {},
			outputFileNames: [path.join(outputDir, "src/index.js")],
		},
		{
			fileName: path.join(projectDir, "src/index.ts"),
			name: "respects rootDir",
			options: { rootDir: path.join(projectDir, "src") },
			outputFileNames: [path.join(outputDir, "index.js")],
		},
		{
			fileName: path.join(projectDir, "src/component.tsx"),
			name: "preserves JSX files",
			options: { jsx: "preserve" },
			outputFileNames: [path.join(outputDir, "src/component.jsx")],
		},
		{
			fileName: path.join(projectDir, "src/component.tsx"),
			name: "maps source maps for preserved JSX files",
			options: { jsx: "preserve", sourceMap: true },
			outputFileNames: [
				path.join(outputDir, "src/component.jsx"),
				path.join(outputDir, "src/component.jsx.map"),
			],
		},
		{
			fileName: path.join(projectDir, "src/index.ts"),
			name: "does not preserve JSX for TypeScript files",
			options: { jsx: "preserve" },
			outputFileNames: [path.join(outputDir, "src/index.js")],
		},
		{
			fileName: path.join(projectDir, "src/component.tsx"),
			name: "uses JavaScript extension for react-native",
			options: { jsx: "react-native" },
			outputFileNames: [path.join(outputDir, "src/component.js")],
		},
		{
			fileName: path.join(projectDir, "src/component.jsx"),
			name: "transforms JSX files when not preserving JSX",
			options: { allowJs: true, jsx: "react" },
			outputFileNames: [path.join(outputDir, "src/component.js")],
		},
		{
			fileName: path.join(projectDir, "src/module.mts"),
			name: "maps .mts files",
			options: {},
			outputFileNames: [path.join(outputDir, "src/module.mjs")],
		},
		{
			fileName: path.join(projectDir, "src/module.mts"),
			name: "maps .mts JavaScript, declarations, and maps",
			options: {
				declaration: true,
				declarationMap: true,
				sourceMap: true,
			},
			outputFileNames: [
				path.join(outputDir, "src/module.mjs"),
				path.join(outputDir, "src/module.mjs.map"),
				path.join(outputDir, "src/module.d.mts"),
				path.join(outputDir, "src/module.d.mts.map"),
			],
		},
		{
			fileName: path.join(projectDir, "src/module.cts"),
			name: "maps .cts files",
			options: {},
			outputFileNames: [path.join(outputDir, "src/module.cjs")],
		},
		{
			fileName: path.join(projectDir, "src/module.cts"),
			name: "maps .cts JavaScript, declarations, and maps",
			options: {
				declaration: true,
				declarationMap: true,
				sourceMap: true,
			},
			outputFileNames: [
				path.join(outputDir, "src/module.cjs"),
				path.join(outputDir, "src/module.cjs.map"),
				path.join(outputDir, "src/module.d.cts"),
				path.join(outputDir, "src/module.d.cts.map"),
			],
		},
		{
			fileName: path.join(projectDir, "src/helper.js"),
			name: "maps JavaScript when allowJs is enabled",
			options: { allowJs: true },
			outputFileNames: [path.join(outputDir, "src/helper.js")],
		},
		{
			fileName: path.join(projectDir, "src/module.mjs"),
			name: "maps declarations for .mjs files",
			options: { allowJs: true, declaration: true, declarationMap: true },
			outputFileNames: [
				path.join(outputDir, "src/module.mjs"),
				path.join(outputDir, "src/module.d.mts"),
				path.join(outputDir, "src/module.d.mts.map"),
			],
		},
		{
			fileName: path.join(projectDir, "src/module.cjs"),
			name: "maps declarations for .cjs files",
			options: { allowJs: true, declaration: true, declarationMap: true },
			outputFileNames: [
				path.join(outputDir, "src/module.cjs"),
				path.join(outputDir, "src/module.d.cts"),
				path.join(outputDir, "src/module.d.cts.map"),
			],
		},
		{
			fileName: path.join(projectDir, "src/data.json"),
			name: "copies JSON files",
			options: {},
			outputFileNames: [path.join(outputDir, "src/data.json")],
		},
		{
			fileName: path.join(projectDir, "src/data.json"),
			name: "does not copy JSON with emitDeclarationOnly",
			options: { emitDeclarationOnly: true },
			outputFileNames: [],
		},
		{
			fileName: path.join(projectDir, "src/index.ts"),
			name: "maps source and declaration files",
			options: {
				declaration: true,
				declarationMap: true,
				sourceMap: true,
			},
			outputFileNames: [
				path.join(outputDir, "src/index.js"),
				path.join(outputDir, "src/index.js.map"),
				path.join(outputDir, "src/index.d.ts"),
				path.join(outputDir, "src/index.d.ts.map"),
			],
		},
		{
			fileName: path.join(projectDir, "src/index.ts"),
			name: "uses declarationDir for declaration output",
			options: {
				declaration: true,
				declarationDir: "types",
			},
			outputFileNames: [
				path.join(outputDir, "src/index.js"),
				path.join(projectDir, "types/src/index.d.ts"),
			],
		},
		{
			fileName: path.join(projectDir, "src/index.ts"),
			name: "maps declarations in declarationDir",
			options: {
				declaration: true,
				declarationDir: "types",
				declarationMap: true,
			},
			outputFileNames: [
				path.join(outputDir, "src/index.js"),
				path.join(projectDir, "types/src/index.d.ts"),
				path.join(projectDir, "types/src/index.d.ts.map"),
			],
		},
		{
			fileName: path.join(projectDir, "src/index.ts"),
			name: "omits JavaScript with emitDeclarationOnly",
			options: {
				declaration: true,
				emitDeclarationOnly: true,
			},
			outputFileNames: [path.join(outputDir, "src/index.d.ts")],
		},
		{
			fileName: path.join(projectDir, "src/index.d.ts"),
			name: "skips declaration inputs",
			options: { declaration: true },
			outputFileNames: [],
		},
		{
			fileName: path.join(projectDir, "src/app.d.css.ts"),
			name: "skips declaration files with arbitrary extensions",
			options: { declaration: true },
			outputFileNames: [],
		},
	] as const;

	it.for(outputCases)(
		"$name",
		({ fileName, options, outputFileNames }, { expect }) => {
			expect(
				getOutputFileNames(
					{ configFilePath, outDir: "dist", ...options },
					fileName,
				),
			).toStrictEqual(outputFileNames);
		},
	);

	describe.runIf(
		typescriptVersion >= TYPESCRIPT_6_0 && typescriptVersion < TYPESCRIPT_7_0,
	)("matches ts.getOutputFileNames", () => {
		it.for(outputCases)("$name", ({ fileName, options }, { expect }) => {
			const parsed = ts.parseJsonConfigFileContent(
				{
					compilerOptions: { outDir: "dist", ...options },
					files: [path.relative(projectDir, fileName)],
				},
				parseConfigHost,
				projectDir,
				undefined,
				configFilePath,
			);
			const predicted = getOutputFileNames(
				{ configFilePath, outDir: "dist", ...options },
				fileName,
			);
			const compilerOutput = ts
				.getOutputFileNames(parsed, fileName, false)
				.map((outputPath) => path.normalize(outputPath));

			expect(compilerOutput).toStrictEqual(
				predicted.map((outputPath) => path.normalize(outputPath)),
			);
		});
	});
});

describe(getTsBuildInfoEmitOutputFilePath, () => {
	const buildInfoCases = [
		{
			configFileName: "tsconfig.json",
			name: "writes none without incremental or composite",
			options: { outDir: "dist" },
			tsBuildInfoFile: undefined,
		},
		{
			configFileName: "tsconfig.json",
			name: "ignores tsBuildInfoFile without incremental or composite",
			options: { outDir: "dist", tsBuildInfoFile: "dist/build.json" },
			tsBuildInfoFile: undefined,
		},
		{
			configFileName: "tsconfig.json",
			name: "names it after the config in outDir for incremental",
			options: { incremental: true, outDir: "dist" },
			tsBuildInfoFile: path.join(outputDir, "tsconfig.tsbuildinfo"),
		},
		{
			configFileName: "tsconfig.json",
			name: "names it after the config in outDir for composite",
			options: { composite: true, outDir: "dist" },
			tsBuildInfoFile: path.join(outputDir, "tsconfig.tsbuildinfo"),
		},
		{
			configFileName: "tsconfig.json",
			name: "places it in outDir when rootDir is the config directory",
			options: { incremental: true, outDir: "dist", rootDir: "." },
			tsBuildInfoFile: path.join(outputDir, "tsconfig.tsbuildinfo"),
		},
		{
			configFileName: "tsconfig.json",
			name: "places it relative to rootDir",
			options: { incremental: true, outDir: "dist", rootDir: "src" },
			tsBuildInfoFile: path.join(projectDir, "tsconfig.tsbuildinfo"),
		},
		{
			configFileName: "tsconfig.json",
			name: "places it next to the config without outDir",
			options: { incremental: true },
			tsBuildInfoFile: path.join(projectDir, "tsconfig.tsbuildinfo"),
		},
		{
			configFileName: "tsconfig.json",
			name: "uses tsBuildInfoFile",
			options: {
				incremental: true,
				outDir: "dist",
				tsBuildInfoFile: "dist/state/build.json",
			},
			tsBuildInfoFile: path.join(outputDir, "state/build.json"),
		},
		{
			configFileName: "my-config",
			name: "names it after a config without an extension",
			options: { incremental: true, outDir: "dist" },
			tsBuildInfoFile: path.join(outputDir, "my-config.tsbuildinfo"),
		},
		{
			configFileName: "tsconfig.custom",
			name: "keeps an unknown config extension",
			options: { incremental: true, outDir: "dist" },
			tsBuildInfoFile: path.join(outputDir, "tsconfig.custom.tsbuildinfo"),
		},
	] as const;

	it.for(buildInfoCases)(
		"$name",
		({ configFileName, options, tsBuildInfoFile }, { expect }) => {
			expect(
				getTsBuildInfoEmitOutputFilePath({
					configFilePath: getConfigFilePath(configFileName),
					...options,
				}),
			).toBe(tsBuildInfoFile);
		},
	);

	describe.runIf(typescriptVersion < TYPESCRIPT_7_0)(
		"matches ts.getTsBuildInfoEmitOutputFilePath",
		() => {
			it.for(buildInfoCases)(
				"$name",
				({ configFileName, options }, { expect }) => {
					const caseConfigFilePath = getConfigFilePath(configFileName);
					const parsed = ts.parseJsonConfigFileContent(
						{ compilerOptions: options, files: ["src/index.ts"] },
						parseConfigHost,
						projectDir,
						undefined,
						caseConfigFilePath,
					);
					const predicted = getTsBuildInfoEmitOutputFilePath({
						configFilePath: caseConfigFilePath,
						...options,
					});
					const compilerOutput = ts.getTsBuildInfoEmitOutputFilePath(
						parsed.options,
					);

					expect(
						compilerOutput === undefined
							? undefined
							: path.normalize(compilerOutput),
					).toBe(predicted);
				},
			);
		},
	);
});

function getConfigFilePath(configFileName: string): string {
	return path.join(projectDir, configFileName);
}
