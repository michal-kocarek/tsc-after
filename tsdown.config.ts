import { defineConfig } from "tsdown";

// Nothing from `dist/` is importable (`exports: null`), so each entrypoint is
// bundled into a single module to keep CLI startup fast.
export default defineConfig({
	deps: {
		onlyBundle: [],
	},
	entry: {
		tscAfter: "src/entrypoints/tscAfter.ts",
	},
	fixedExtension: false,
	publint: {
		strict: true,
	},
});
