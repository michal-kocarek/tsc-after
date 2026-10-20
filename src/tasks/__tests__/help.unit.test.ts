import { stripVTControlCharacters } from "node:util";
import { describe, it, vi } from "vitest";

import { help } from "../help.ts";

describe(help, () => {
	it("should print help", ({ expect }) => {
		using log = vi.spyOn(console, "log").mockReturnValue();

		help();

		expect(log).toHaveBeenCalledExactlyOnceWith(expect.any(String));

		const output = (log.mock.calls[0] ?? []).join("");

		expect(stripVTControlCharacters(output)).toMatchSnapshot();
	});
});
