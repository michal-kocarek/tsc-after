import { UserError } from "../common/errors.ts";
import { printError, tryParseArgs } from "../common/util.ts";
import { help } from "../tasks/help.ts";
import { mainAction } from "../tasks/mainAction.ts";
import { version } from "../tasks/version.ts";

function main(): void {
	const args = tryParseArgs();
	if (args === undefined) {
		return;
	}

	try {
		if (args.values.version) {
			version();
		} else if (args.values.help) {
			help();
		} else {
			mainAction(args);
		}
	} catch (error) {
		if (!(error instanceof UserError)) {
			throw error;
		}

		printError(error.message);
	}
}

main();
