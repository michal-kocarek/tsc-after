import { tryParseArgs } from "../common/util.ts";
import { help } from "../tasks/help.ts";
import { mainAction } from "../tasks/mainAction.ts";
import { version } from "../tasks/version.ts";

function main() {
	const args = tryParseArgs();
	if (args === undefined) {
		return;
	}

	if (args.values.version) {
		version();
	} else if (args.values.help) {
		help();
	} else {
		mainAction(args);
	}
}

main();
