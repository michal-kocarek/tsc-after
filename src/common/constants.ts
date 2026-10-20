import type { ParseArgsOptionsConfig } from "node:util";

export const binName = "tsc-after";

export const cliArgsOptions = {
	// NOTE: Argument names MUST use camelCase notation (to mimic `tsc` arguments convention)

	/* eslint-disable perfectionist/sort-objects */
	help: {
		default: false,
		helpDescription: "Print this message.",
		short: "h",
		type: "boolean",
	},
	version: {
		default: false,
		helpDescription: "Print the version.",
		type: "boolean",
	},
	project: {
		default: "tsconfig.json",
		helpDescription:
			"Use the project given the path to its configuration file, or to a folder with a 'tsconfig.json'.",
		short: "p",
		type: "string",
	},
	noClean: {
		default: false,
		helpDescription: "Disable removing stale outputs from 'outDir'.",
		type: "boolean",
	},
	dry: {
		default: false,
		helpDescription: "Show what would be deleted.",
		short: "d",
		type: "boolean",
	},
	verbose: {
		default: false,
		helpDescription: "Enable verbose logging.",
		type: "boolean",
	},
	/* eslint-enable perfectionist/sort-objects */
} as const satisfies ParseArgsOptionsConfig &
	Record<string, { helpDescription: string }>;
