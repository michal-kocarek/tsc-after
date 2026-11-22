<h1 align="center">tsc-after</h1>

<p align="center">Your <code>dist</code>, as <code>tsc</code> should've left it. 🧹</p>

<p align="center">
	<a href="https://npmjs.com/package/tsc-after"><img alt="npm version" src="https://img.shields.io/npm/v/tsc-after" /></a>
	<a href="https://codecov.io/gh/michal-kocarek/tsc-after"><img alt="Coverage" src="https://img.shields.io/codecov/c/github/michal-kocarek/tsc-after" /></a>
	<a href="./LICENSE.md"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" /></a>
</p>

`tsc` compiles your files, but it never deletes anything.
Rename `foo.ts` to `foo/index.ts`, and `dist/foo.js` lives on forever.

`tsc-after` reads your `tsconfig.json`, works out which files `tsc` would emit today, and removes the stale outputs it wouldn't.

## Install

```sh
npm install --save-dev tsc-after
```

## Usage

In `package.json`, replace the clean-then-compile command:

```diff
- rm -rf dist && tsc
+ tsc && tsc-after
```

## Options

- `--project`, `-p`: Use the project given a config file or a directory containing `tsconfig.json`.
- `--dry`, `-d`: Preview removals and copies without changing files.
- `--verbose`: Enable verbose logging of removed, copied, and skipped entries.
- `--copy <source:destination>`: Copy a file into `outDir` and keep its destination during cleanup.
- `--noClean`: Disable removing stale outputs from `outDir`.
- `--help`, `-h`: Print the help message.
- `--version`: Print the version.

Relative `--copy` sources resolve from the current working directory, not `rootDir`, and destinations resolve from `outDir`.
For example, with the current working directory at the project root and `outDir` set to `dist`, `--copy src/asset.json:asset.json` copies `src/asset.json` to `dist/asset.json`.

`tsc-after` asks TypeScript which files the project emits, then removes every other regular file except `--copy` destinations in `outDir` and `declarationDir`, along with directories left empty.
It skips symbolic links and entries on other devices inside `outDir` or `declarationDir`.

## Limitations

`tsc-after` reads your tsconfig the way `tsc` does; this list covers only where it differs.

- Anything in `outDir` or `declarationDir` other than TypeScript outputs or `--copy` destinations is removed as stale.
- `--copy` copies single files; globs and directories are not supported.
- `outFile` is rejected, and project references are not followed.
- TypeScript 7.1 support follows its beta API and may change with TypeScript releases.

For the roadmap, see [`product.md`](./docs/product.md) and the [vNext milestone](https://github.com/michal-kocarek/tsc-after/milestone/2).

## Security measures

- Cleanup is refused unless `outDir` is set and `noEmit` is disabled.
- `outDir` and `declarationDir` must be inside, and not equal to, the current working directory.
- Cleanup is refused when `outDir` or `declarationDir` contains a source file of the project.
- Cleanup is refused when `outDir` or `declarationDir` is reached through a symbolic link.
- `--copy` sources must be regular files inside the current working directory and outside `outDir` and `declarationDir`.
- `--copy` destinations must stay inside `outDir` and cannot be written through symbolic links.
- A `--project` path outside the current working directory is refused.
- Without `--project`, only `tsconfig.json` in the current working directory is read; unlike `tsc`, parent directories are not searched.

## Requirements

- Node.js 16.19.0 or later, including the latest LTS.
- TypeScript 4.2.4 through 7.x, including 7.1 beta (except 7.0, which has no API support).

## Why not `rm -rf dist && tsc`?

Wiping `outDir` before every build (`rm -rf dist && tsc`, `rimraf dist && tsc`, or a `prebuild` script) is the usual fix for stale outputs.
On GitHub, about 274k `package.json` files run `rm -rf dist` and another 199k run `rimraf dist` (see [`market-research.md`](./docs/market-research.md)).

`tsc-after` is intended to remove only stale outputs rather than wiping `outDir` and rebuilding everything.
That brings:

- Incremental builds without extra tooling: with `incremental` or `composite`, the `.tsbuildinfo` file and unchanged outputs survive, so `tsc` re-emits only what changed.
- Less work for file watchers: IDEs, `tsc --watch` in dependent packages, `node --watch`, nodemon, and test runners see only the changed files instead of every output being deleted and recreated.
- No missing outputs mid-build: dependent packages, running dev servers, and IDE type checking never see an empty `outDir`.
- A failed build never leaves `outDir` empty: with `tsc && tsc-after`, cleanup runs only after `tsc` succeeds.

**Using a bundler such as tsup, Vite, or esbuild?**<br>
They already clean up after themselves, so you probably don't need `tsc-after`.

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
