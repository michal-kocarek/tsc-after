import ts from "typescript";

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
