import { UserError } from "../common/errors.ts";
import { parseArgs, printError } from "../common/util.ts";
import { help } from "../tasks/help.ts";
import { mainAction } from "../tasks/mainAction.ts";
import { version } from "../tasks/version.ts";

async function main(): Promise<void> {
	try {
		const args = parseArgs(process.argv.slice(2));

		if (args.values.version) {
			version();
		} else if (args.values.help) {
			help();
		} else {
			await mainAction(args);
		}
	} catch (error) {
		if (!(error instanceof UserError)) {
			throw error;
		}

		printError(error.message);
	}
}

void main();
