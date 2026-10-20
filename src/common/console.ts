import { styleText } from "node:util";

export function print(...messages: string[]) {
	// eslint-disable-next-line no-console
	console.log(messages.join(" "));
}

export function printError(...messages: string[]): void {
	// eslint-disable-next-line no-console
	console.error(styleText("red", `error: ${messages.join(" ")}`));

	process.exitCode = 1;
}
