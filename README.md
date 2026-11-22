<h1 align="center">tsc-after</h1>

<p align="center">Your <code>dist</code>, as <code>tsc</code> should've left it.</p>

<p align="center">
	<a href="https://npmjs.com/package/tsc-after"><img alt="npm version" src="https://img.shields.io/npm/v/tsc-after" /></a>
	<a href="https://github.com/michal-kocarek/tsc-after/actions/workflows/ci.yaml?query=branch%3Amain"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/michal-kocarek/tsc-after/ci.yaml?branch=main&label=CI" /></a>
	<a href="https://codecov.io/gh/michal-kocarek/tsc-after"><img alt="Coverage" src="https://img.shields.io/codecov/c/github/michal-kocarek/tsc-after" /></a>
	<a href="./LICENSE.md"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" /></a>
</p>

`tsc` compiles your files, but it never deletes anything.
Rename `src/foo.ts` to `src/foo/index.ts`, and `dist/foo.js` lives on forever.

`tsc-after` reads your tsconfig, asks TypeScript which files `tsc` emits, and removes every other file in `outDir`, plus any directories left empty.
It is tested against real `tsc` output on Linux and Windows, and has no dependencies beyond the TypeScript already in your project.

## Why not `rm -rf dist && tsc`?

Wiping `outDir` before every build (`rm -rf dist && tsc`, `rimraf dist && tsc`, or a `prebuild` script) is the usual fix for stale outputs.
On GitHub, about 274,000 `package.json` files run `rm -rf dist`, and another 199,000 run `rimraf dist` (see [`market-research.md`](./docs/market-research.md)).

`tsc-after` removes only stale outputs, so the rest of `outDir` stays in place:

- **Incremental builds.** With `incremental` or `composite`, the `.tsbuildinfo` file and unchanged outputs survive, so `tsc` re-emits only what changed.
- **Quiet file watchers.** IDEs, `node --watch`, nodemon, and test runners see only the files that changed.
- **No empty `outDir`.** Dependent packages, dev servers, and IDE type checking never see missing outputs, even mid-build or after a failed build.
  With `tsc && tsc-after`, cleanup runs only after `tsc` succeeds.

## Install

```sh
npm install --save-dev tsc-after
```

Release notes are in [`CHANGELOG.md`](./CHANGELOG.md).

## Usage

In `package.json`, replace the clean-then-compile command:

```diff
- rm -rf dist && tsc
+ tsc && tsc-after
```

> **Important:** If another tool or a script also writes into `outDir` or `declarationDir`, `tsc-after` removes those files as stale, because `tsc` doesn't emit them.
> Point such tools at another directory, or bring single files in with `--copy`.

Try it first with `--dry`, which lists what would be removed without changing any files:

```sh
npx tsc-after --dry
```

More examples:

```sh
# Clean up after a build that uses another tsconfig.
tsc -p tsconfig.build.json && tsc-after -p tsconfig.build.json

# Remove stale outputs, then copy src/schema.json to outDir/schema.json.
tsc && tsc-after --copy src/schema.json:schema.json
```

Now that `outDir` survives between builds, turn on [`incremental`](https://www.typescriptlang.org/tsconfig/#incremental) in your tsconfig, so `tsc` re-emits only what changed.

## Options

- `--project`, `-p`: Use the project given the path to its configuration file, or to a directory with a `tsconfig.json`.
- `--dry`, `-d`: Preview removals and copies without changing files.
- `--verbose`: Enable verbose logging of removed, copied, and skipped entries.
- `--copy <source>:<destination>`: Copy a file to a path relative to `outDir`.
  The source is relative to the current working directory.
  Repeat the flag to copy more files.
- `--noClean`: Skip cleanup and only run `--copy`.
- `--help`, `-h`: Print the help message.
- `--version`: Print the version.

## Limitations

`tsc-after` reads your tsconfig the way `tsc` does.
This list covers only where it differs.

- `--copy` copies single files, not globs or directories.
- `outFile` is rejected, and project references are not followed.
- TypeScript 7.1 support follows its beta API and may change with TypeScript releases.

## Safety

`tsc-after` deletes files, so it is built to be predictable:

- **Checked against `tsc`.** [Tests](./src/__tests__/emittedLayouts.e2e.test.ts) compile real projects and compare what `tsc-after` keeps with `tsc --listEmittedFiles`.
- **Tested where you run it.** [CI](./.github/workflows/ci.yaml) runs every test on Linux and Windows, on the oldest release of each supported Node.js line, and on TypeScript 4.2 through 7.1 beta.
- **Published from CI.** GitHub Actions builds and publishes each release with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), only after CI passes.
- **Refuses rather than guesses.** It stops before changing any file when:
  - `outDir` is not set, or `noEmit` is enabled.
  - `outDir` or `declarationDir` is the current working directory or outside it, contains a source file of the project, or is reached through a symbolic link.
  - A `--copy` source is not a regular file inside the current working directory, or lies inside `outDir` or `declarationDir`.
  - A `--copy` destination leaves `outDir`, or would be written through a symbolic link.
  - The `--project` path is outside the current working directory.
  - `--project` is omitted and the current working directory has no `tsconfig.json`.
    Unlike `tsc`, it doesn't search parent directories.

## Requirements

- Node.js 16.19.0 or later.
- TypeScript 4.2.4 to 6.x, or 7.1 beta to 7.x (7.0 has no API).

## Contributing

See [`CONTRIBUTING.md`](./.github/CONTRIBUTING.md) and [`DEVELOPMENT.md`](./.github/DEVELOPMENT.md).
For project-specific AI agent guidance, see [`AGENTS.md`](./AGENTS.md).

## Contributors

<!-- spellchecker: disable -->
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<ul>
<li><a href="https://github.com/michal-kocarek">Michal Kočárek</a> <span title="Code">💻</span> <span title="Content">🖋</span> <span title="Documentation">📖</span> <span title="Ideas, Planning, & Feedback">🤔</span> <span title="Infrastructure (Hosting, Build-Tools, etc)">🚇</span> <span title="Maintenance">🚧</span> <span title="Project Management">📆</span> <span title="Tools">🔧</span></li>
</ul>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- spellchecker: enable -->
