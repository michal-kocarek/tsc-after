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
It skips symbolic links and entries on other devices.

`--dry` lists planned removals without changing files.
Use `--verbose` to add individual removed and skipped entries.

## Limitations

`tsc-after` reads your tsconfig the way `tsc` does; this list covers only where it differs.

- `outDir` must be set and hold only TypeScript outputs, and so must `declarationDir` when set.
  Anything else there, including copied assets, is removed as stale.
- Cleanup is refused when `outDir` or `declarationDir` contains a source file or tsconfig file of the project.
- The project must be inside the current working directory, and parent directories are not searched for `tsconfig.json`.
- `noEmit`, `outFile`, `composite`, watch options, `incremental`, and `tsBuildInfoFile` ([#4](https://github.com/michal-kocarek/tsc-after/issues/4)) are rejected, and project references are not followed.
- TypeScript 3.9 through 4.1 require `rootDir` ([#15](https://github.com/michal-kocarek/tsc-after/issues/15)).
- TypeScript 3.9 support is limited: `emitDeclarationOnly` with `resolveJsonModule` and JSON source files, and `allowJs` with `jsx: preserve`, `declaration`, and `.jsx` source files are refused ([#15](https://github.com/michal-kocarek/tsc-after/issues/15)).
- TypeScript 7.1 beta support is experimental, and `extends` there must be a file path, not a package name.
- Cleanup safety checks ([#6](https://github.com/michal-kocarek/tsc-after/issues/6)) are incomplete, so keep valuable files out of `outDir`.

Planned: `--copy`, `--exclude`, and `--watch`.
See [`product.md`](./docs/product.md) for the roadmap.

## Requirements

- Node.js `^16.19.0 || >=18.11.0`.
- TypeScript 3.9.10+, 4.x–6.x, and 7.1.0-beta through 7.x are supported; TypeScript 7.0 is not.

## Exit codes

- `0` for success, including a dry run or nothing to remove
- `1` for a configuration or cleanup error
- `2` for invalid command-line arguments

## Why not `rm -rf dist && tsc`?

Wiping `outDir` before every build (`rm -rf dist && tsc`, `rimraf dist && tsc`, or a `prebuild` script) is the usual fix for stale outputs.
On GitHub, about 274k `package.json` files run `rm -rf dist` and another 199k run `rimraf dist` (see [`market-research.md`](./docs/market-research.md)).

`tsc-after` is intended to remove only stale outputs rather than wiping `outDir` and rebuilding everything.

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
