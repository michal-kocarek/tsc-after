import path from "node:path";
import { describe, it } from "vitest";

import { getOutputFileNames } from "../outputPaths.ts";

const projectDir = path.resolve("/project");
const configFilePath = path.join(projectDir, "tsconfig.json");
const outputDir = path.join(projectDir, "dist");

describe(getOutputFileNames, () => {
	it.for([
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
	])("$name", ({ fileName, options, outputFileNames }, { expect }) => {
		expect(
			getOutputFileNames(
				{ configFilePath, outDir: "dist", ...options },
				fileName,
			),
		).toStrictEqual(outputFileNames);
	});
});
