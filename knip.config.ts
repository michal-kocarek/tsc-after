import type { KnipConfig } from "knip";

export default {
	entry: ["src/**/__tests__/*.test.*"],
	// Changelog preset loaded by name from .release-it.json
	ignoreDependencies: ["conventional-changelog-conventionalcommits"],
	project: ["src/**/*.ts", "!src/**/__tests__/fixtures"],
	treatConfigHintsAsErrors: true,
} satisfies KnipConfig;
