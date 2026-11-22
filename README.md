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

## Usage

In `package.json`, replace the clean-then-compile command:

```diff
- rm -rf dist && tsc
+ tsc && tsc-after
```

Additional usage:

```sh
# Clean after compile; run after tsc build.
tsc-after

# Preview planned removals for tsconfig.json.
tsc-after --dry

# Select a tsconfig file instead of the default.
tsc-after --project tsconfig.build.json

# Select a folder with a tsconfig.json.
tsc-after -p packages/core
```

`tsc-after` asks TypeScript which files the project emits, then removes every other regular file in `outDir` and `declarationDir`, along with directories left empty.
It skips symbolic links and entries on other devices inside `outDir` or `declarationDir`.

`--dry` lists planned removals without changing files.
Use `--verbose` to add individual removed and skipped entries.

## Limitations

`tsc-after` reads your tsconfig the way `tsc` does; this list covers only where it differs.

- `outDir` (and `declarationDir`) must hold only TypeScript outputs: anything else, including copied assets, is removed as stale.
- `outFile` is rejected, and project references are not followed.
- Support for TypeScript 3.9 - 4.1 is limited, because they compute output paths differently:
  - `rootDir` is required ([#15](https://github.com/michal-kocarek/tsc-after/issues/15)).
  - 3.9 only: `emitDeclarationOnly` with `resolveJsonModule` and JSON source files, and `allowJs` with `jsx: preserve`, `declaration`, and `.jsx` source files are refused ([#15](https://github.com/michal-kocarek/tsc-after/issues/15)).
- TypeScript 7.1 beta support is experimental.

Planned: `--copy`, `--exclude`, and `--watch`.
See [`product.md`](./docs/product.md) for the roadmap.

## Security measures

- Cleanup is refused unless `outDir` is set and `noEmit` is disabled.
- `outDir` and `declarationDir` must be inside, and not equal to, the current working directory.
- Cleanup is refused when `outDir` or `declarationDir` contains a source file of the project.
- Cleanup is refused when `outDir` or `declarationDir` is reached through a symbolic link.
- A `--project` path outside the current working directory is refused.
- Without `--project`, only `tsconfig.json` in the current working directory is read; unlike `tsc`, parent directories are not searched.

## Requirements

- Node.js 16.19.0 or later, including the latest LTS.
- TypeScript 3.9.10 through 7.x, including 7.1 beta (except 7.0, which has no API support).

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
