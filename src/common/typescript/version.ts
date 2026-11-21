import ts from "typescript";

// Oldest supported version: 3.7 added `getOutputFileNames`, 3.8 `watchOptions`;
// 3.9 is the oldest that passes the test suite unchanged (verified in CI).
export const TYPESCRIPT_3_9 = 3_009_000;
export const TYPESCRIPT_4_2 = 4_002_000;
export const TYPESCRIPT_7_0 = 7_000_000;
export const TYPESCRIPT_7_1 = 7_001_000;

export function parseTypeScriptVersion(version: string): number {
	const match =
		/^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-[-.0-9A-Za-z]+)?(?:\+[-.0-9A-Za-z]+)?$/u.exec(
			version,
		);
	if (match?.groups === undefined) {
		return Number.NaN;
	}

	const { major, minor, patch } = match.groups;
	return Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch);
}

export const typescriptVersion = parseTypeScriptVersion(ts.version);
