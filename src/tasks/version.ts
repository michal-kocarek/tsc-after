import ts from "typescript";

import packageJson from "../../package.json" with { type: "json" };
import { binName } from "../common/constants.ts";
import { print } from "../common/util.ts";

export function version() {
	print(
		`${binName}/${packageJson.version} ${process.platform}-${process.arch} node-${process.versions.node} typescript-${ts.version}`,
	);
}
