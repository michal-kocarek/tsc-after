import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import { configs as eslintConfigs } from "@eslint/js";
import markdown from "@eslint/markdown";
import shell from "@eslint/shell";
import vitest from "@vitest/eslint-plugin";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import { configs as jsdocConfigs } from "eslint-plugin-jsdoc";
import { configs as jsoncConfigs } from "eslint-plugin-jsonc";
import n from "eslint-plugin-n";
import { configs as packageJsonConfigs } from "eslint-plugin-package-json";
import { configs as perfectionistConfigs } from "eslint-plugin-perfectionist";
import { configs as regexpConfigs } from "eslint-plugin-regexp";
import { configs as ymlConfigs } from "eslint-plugin-yml";
import { defineConfig, globalIgnores, includeIgnoreFile } from "eslint/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { configs as tsEslintConfigs } from "typescript-eslint";

const ALL_CODE_GLOB = ["**/*.{js,ts}"];
const BIN_FILES_GLOB = "bin/*.js";
const CONFIG_FILES_GLOB = "*.config.{js,ts}";
// Node.js used for development (`.nvmrc`), as opposed to `engines.node` for users
const DEV_NODE_VERSION = `>=${readFileSync(new URL(".nvmrc", import.meta.url), "utf8").trim()}`;
const SHELL_FILES_GLOB = ["**/*.sh", "scripts/*"];
const TEST_FILES_GLOB = "**/__tests__/**.{js,ts}";
const TSCONFIG_GLOB = "**/tsconfig*.json";

export default defineConfig(
	includeIgnoreFile(fileURLToPath(new URL(".gitignore", import.meta.url)), {
		name: "Global imported ignores",
	}),
	globalIgnores(
		["CHANGELOG.md", "src/**/__tests__/fixtures", "pnpm-lock.yaml", ".husky/_"],
		"Additional global ignores",
	),
	{
		linterOptions: {
			reportUnusedDisableDirectives: "error",
			reportUnusedInlineConfigs: "error",
		},
		name: "Global settings",
	},
	{
		extends: [
			comments.recommended,
			eslintConfigs.recommended,
			jsdocConfigs["flat/contents-typescript-error"],
			jsdocConfigs["flat/logical-typescript-error"],
			jsdocConfigs["flat/stylistic-typescript-error"],
			{
				...n.configs["flat/all"],
				rules: {
					...n.configs["flat/all"].rules,
					"n/no-hide-core-modules": "off", // Deprecated rule
					"n/shebang": "off", // Deprecated rule
				},
			},
			perfectionistConfigs["recommended-natural"],
			regexpConfigs["flat/all"],
			tsEslintConfigs.strictTypeChecked,
			tsEslintConfigs.stylisticTypeChecked,
			importX.flatConfigs.recommended,
			importX.flatConfigs.typescript,
		],
		files: [...ALL_CODE_GLOB],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [BIN_FILES_GLOB],
				},
			},
		},
		name: "All source code",
		rules: {
			"@typescript-eslint/consistent-type-imports": "error",
			"@typescript-eslint/default-param-last": "error",
			"@typescript-eslint/strict-boolean-expressions": "error",
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			eqeqeq: "error",
			"import-x/default": "off",
			"import-x/namespace": "off",
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					devDependencies: [TEST_FILES_GLOB, CONFIG_FILES_GLOB],
					includeTypes: true,
				},
			],
			"import-x/no-named-as-default": "off",
			"import-x/no-named-as-default-member": "off",
			"logical-assignment-operators": [
				"error",
				"always",
				{ enforceForIfStatements: true },
			],
			"n/no-sync": "off",
			"no-console": "error",
			"no-else-return": "error",
			"no-shadow": "error",
			"no-useless-rename": "error",
			"object-shorthand": "error",
			"one-var": ["error", "never"],
			"operator-assignment": "error",
		},
		settings: {
			"import-x/resolver-next": [createTypeScriptImportResolver()],
			perfectionist: { partitionByComment: true, type: "natural" },
		},
	},
	{
		files: [...ALL_CODE_GLOB],
		ignores: ["**/__tests__/**"],
		name: "Non-dev source code",
		rules: {
			"import-x/no-restricted-paths": [
				"error",
				{
					zones: [
						{
							from: "**/__tests__/**",
							message: "Files outside __tests__ cannot import test files.",
							target: ".",
						},
					],
				},
			],
			// The v flag requires Node.js 20; engines.node also supports Node.js 16 and 18.
			"regexp/require-unicode-sets-regexp": "off",
		},
	},
	{
		files: [TEST_FILES_GLOB, CONFIG_FILES_GLOB],
		name: "Dev-only code",
		settings: { n: { version: DEV_NODE_VERSION } },
	},
	{
		extends: [jsoncConfigs["flat/recommended-with-json"]],
		files: ["**/*.json"],
		ignores: [TSCONFIG_GLOB],
		name: "JSON files",
	},
	{
		extends: [jsoncConfigs["flat/recommended-with-jsonc"]],
		files: ["**/*.jsonc", TSCONFIG_GLOB],
		name: "JSONC files",
	},
	{
		extends: [markdown.configs.recommended],
		files: ["**/*.md"],
		name: "Markdown files",
		rules: {
			// https://github.com/eslint/markdown/issues/294
			"markdown/no-missing-label-refs": "off",
		},
	},
	{
		extends: [tsEslintConfigs.disableTypeChecked],
		files: ["**/*.md/*.ts"],
		name: "Injected code in Markdown",
		rules: { "n/no-missing-import": "off" },
	},
	{
		extends: [vitest.configs.all],
		files: [TEST_FILES_GLOB],
		name: "Test files",
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							importNames: ["expect"],
							message: "Use the expect provided by the test context instead.",
							name: "vitest",
						},
					],
				},
			],
			"vitest/max-expects": ["warn", { max: 10 }],
			"vitest/no-hooks": "off",
			"vitest/prefer-expect-assertions": "off",
			"vitest/prefer-importing-vitest-globals": "off",
		},
		settings: { vitest: { typecheck: true } },
	},
	{
		files: SHELL_FILES_GLOB,
		name: "Shell script files",
		plugins: { shell: { languages: shell.languages, rules: shell.rules } },
		// Replace with something like .strict or .all when this package matures and introduces ruleset groups
		rules: Object.fromEntries(
			Object.keys(shell.rules).map((rule) => [
				`shell/${rule}`,
				"error" as const,
			]),
		),
	},
	{
		extends: [ymlConfigs["flat/standard"], ymlConfigs["flat/prettier"]],
		files: ["**/*.{yml,yaml}"],
		name: "YAML files",
		rules: {
			"yml/file-extension": "error",
			"yml/sort-keys": [
				"error",
				{ order: { type: "asc" }, pathPattern: "^.*$" },
			],
			"yml/sort-sequence-values": [
				"error",
				{ order: { type: "asc" }, pathPattern: "^.*$" },
			],
		},
	},
	{
		files: [
			".github/workflows/**/*.{yml,yaml}",
			".github/actions/**/*.{yml,yaml}",
		],
		name: "GitHub Action YAML files",
		rules: {
			"yml/sort-keys": "off",
		},
	},
	{
		extends: [packageJsonConfigs.recommended, packageJsonConfigs.stylistic],
		files: ["package.json"],
		name: "package.json file",
		rules: {
			// Disable, as long as we have "exports": null
			"package-json/valid-exports": "off",
		},
	},
);
