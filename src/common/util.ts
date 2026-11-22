import * as util from "node:util";

import { cliArgsOptions } from "./constants.ts";
import { parseCopyEntry } from "./copy.ts";
import { isNodeErrorOf, UserError } from "./errors.ts";

const EXIT_CODE_ERROR = 1;
const EXIT_CODE_INVALID_ARGUMENTS = 2;

/**
 * `util.styleText()` exists only from Node.js 20.12 / 21.7; older versions get plain text.
 */
export const styleText: typeof util.styleText =
	// eslint-disable-next-line n/no-unsupported-features/node-builtins -- Feature-detected right here.
	"styleText" in util ? util.styleText : (_format, text) => text;

export function print(...messages: string[]) {
	// eslint-disable-next-line no-console
	console.log(messages.join(" "));
}

export function printError(...messages: string[]): void {
	// eslint-disable-next-line no-console
	console.error(styleText("red", `error: ${messages.join(" ")}`));

	if ((process.exitCode ?? 0) === 0) {
		process.exitCode = EXIT_CODE_ERROR;
	}
}

/**
 * List of error codes that `util.parseArgs()` can throw
 * @see https://nodejs.org/docs/latest/api/errors.html#nodejs-error-codes
 */
const PARSE_ARGS_ERROR_CODES = [
	"ERR_PARSE_ARGS_UNKNOWN_OPTION",
	"ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
	"ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
] as const;

export type ParsedCliArgs = ReturnType<typeof parseArgs>;

export function parseArgs(args: string[]) {
	const parsed = parseNodeArgs(args);

	if (parsed.values.noClean && parsed.values.copy.length === 0) {
		throw invalidArgument(
			"Option '--noClean' cannot be specified without specifying option '--copy'.",
		);
	}

	const copyEntries = parsed.values.copy.map((value) => {
		const entry = parseCopyEntry(value);

		if (entry === undefined) {
			throw invalidArgument(
				`Option '--copy' expects '<source>:<destination>', got '${value}'.`,
			);
		}

		return entry;
	});

	return { ...parsed, copyEntries };
}

function invalidArgument(message: string): UserError {
	process.exitCode = EXIT_CODE_INVALID_ARGUMENTS;
	return new UserError(message);
}

function isParseArgsError(error: unknown): error is TypeError {
	return PARSE_ARGS_ERROR_CODES.some((code) =>
		isNodeErrorOf(error, TypeError, code),
	);
}

function parseNodeArgs(args: string[]) {
	try {
		// Node.js 16.19 / 18.11 added `default` to `util.parseArgs()`, which sets the `engines.node` floor.
		// eslint-disable-next-line n/no-unsupported-features/node-builtins -- Experimental there, but behaves the same.
		return util.parseArgs({ args, options: cliArgsOptions });
	} catch (error) {
		if (isParseArgsError(error)) {
			throw invalidArgument(
				error.message.endsWith(".") ? error.message : `${error.message}.`,
			);
		}

		throw error;
	}
}
