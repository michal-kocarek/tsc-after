import path from "node:path";
import { defineConfig } from "vitest/config";

const FIXTURES_GLOB = "**/__tests__/fixtures/**";
const TESTS_GLOB = "**/__tests__/**";

// eslint-disable-next-line n/no-process-env -- CI collects test reports to upload from failed jobs.
const testResultsDir = process.env["TEST_RESULTS_DIR"] ?? "";
// Unit and end-to-end tests run separately; colons are invalid in Windows file names.
const testResultsFileName = `vitest-${new Date().toISOString().replaceAll(":", "-")}`;

export default defineConfig({
	test: {
		coverage: {
			autoAttachSubprocess: true,
			exclude: [TESTS_GLOB],
			include: ["src/**/*.ts"],
			reporter: ["html", "lcov"],
		},
		detectAsyncLeaks: true,
		exclude: ["dist", "node_modules", FIXTURES_GLOB],
		expect: {
			requireAssertions: true,
		},
		...(testResultsDir === ""
			? {}
			: {
					outputFile: {
						json: path.join(testResultsDir, `${testResultsFileName}.json`),
						junit: path.join(
							testResultsDir,
							`${testResultsFileName}.junit.xml`,
						),
					},
					// Listing reporters disables the automatic GitHub Actions reporter.
					reporters: ["default", "github-actions", "json", "junit"],
				}),
		projects: [
			{
				extends: true,
				test: {
					exclude: ["src/**/*.e2e.test.ts"],
					include: ["src/**/*.test.ts"],
					name: { color: "blue", label: "unit" },
				},
			},
			{
				extends: true,
				test: {
					include: ["src/**/*.e2e.test.ts"],
					// eslint-disable-next-line n/no-process-env -- Keep CI subprocess contention low.
					maxConcurrency: (process.env["CI"] ?? "") === "" ? 3 : 2,
					maxWorkers: 1,
					name: { color: "cyan", label: "e2e" },
				},
			},
		],
		sequence: {
			concurrent: true,
			shuffle: {
				files: true,
				tests: true,
			},
		},
		setupFiles: ["console-fail-test/setup"],
		slowTestThreshold: 5_000,
		strictTags: true,
		testTimeout: 10_000,
		unstubGlobals: true,
	},
});
