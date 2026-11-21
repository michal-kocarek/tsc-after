/** Error whose message is human-readable and printed to the user without a stack trace. */
export class UserError extends Error {}

export function assertUnreachable(value: never): never {
	throw new Error("Unreachable code reached.", { cause: value });
}

export function isNodeErrorOf<TError extends Error, TCode extends string>(
	error: unknown,
	errorClass: new () => TError,
	code?: TCode,
): error is TError & (typeof code extends undefined ? never : { code: TCode }) {
	if (!(error instanceof errorClass)) {
		return false;
	}

	if (code === undefined) {
		return true;
	}

	return "code" in error && error.code === code;
}
