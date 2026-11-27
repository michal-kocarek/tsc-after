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
			"Use the project given the path to its configuration file, or to a directory with a 'tsconfig.json'.",
		short: "p",
		type: "string",
	},
	noClean: {
		default: false,
		helpDescription: "Skip cleanup and only run '--copy'.",
		type: "boolean",
	},
	copy: {
		default: [],
		helpDescription:
			"Copy a file to a path relative to 'outDir', given as '<source>:<destination>'.",
		multiple: true,
		type: "string",
	},
	dry: {
		default: false,
		helpDescription: "Preview removals and copies without changing files.",
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
