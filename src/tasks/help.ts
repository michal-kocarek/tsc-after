import { binName, cliArgsOptions } from "../common/constants.ts";
import { print, styleText } from "../common/util.ts";

const FLAG_INDENT = 2;
const FLAG_GAP = "  ";

export function help() {
	const flags = Object.entries(cliArgsOptions).map(([name, opts]) => ({
		description: opts.helpDescription,
		name: "short" in opts ? `--${name}, -${opts.short}` : `--${name}`,
	}));
	const flagWidth =
		FLAG_INDENT + Math.max(...flags.map(({ name }) => name.length));

	const heading = (text: string) => styleText("bold", text);
	const command = (text: string, description: string) =>
		`  ${styleText("blueBright", text)}\n  ${description}`;
	const flag = (name: string, description: string) =>
		`${styleText("blueBright", name.padStart(flagWidth))}${FLAG_GAP}${description}`;

	print(
		[
			`${styleText("bold", binName)}: Your outDir, as tsc should've left it.`,
			heading("COMMON COMMANDS"),
			command(
				`tsc && ${binName}`,
				"Removes stale outputs of the current project (tsconfig.json in the working directory).",
			),
			command(
				`${binName} -p ./path/to/tsconfig.json`,
				"Removes stale outputs of the TypeScript project located at the specified path.",
			),
			command(
				`${binName} --dry`,
				"Shows what would be deleted from 'outDir', without deleting anything.",
			),
			heading("COMMAND LINE FLAGS"),
			...flags.map(({ description, name }) => flag(name, description)),
		].join("\n\n"),
	);
}
