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

```sh
# Preview for tsconfig.json; --verbose lists individual paths.
tsc-after --dry --verbose

# Select a tsconfig file instead of the default.
tsc-after --project tsconfig.build.json

# Select a folder with a tsconfig.json.
tsc-after -p packages/core
```

The project path must be inside the current working directory.
Positional arguments and unknown flags are rejected.

For a basic project with a dedicated `outDir`, `tsc-after` uses TypeScript to identify expected outputs, removes other regular files in `outDir`, and removes directories left empty by cleanup.
It skips symbolic links and entries on other devices.
This behavior and its safety limits are not yet verified for every TypeScript configuration or output type.

`--dry` leaves files unchanged, but individual paths are currently printed only with `--verbose`; its summary also reports zero files removed rather than counting planned removals ([issue #8](https://github.com/michal-kocarek/tsc-after/issues/8)).

## Limitations

- `outDir` must be set and dedicated to TypeScript outputs.
  Other regular files there, including copied assets, are treated as stale.
- By default, `tsc-after` reads `tsconfig.json` from the current directory and does not search parent directories.
- `incremental`, `tsBuildInfoFile`, `composite`, `declarationDir`, and watch configurations are rejected.
  Project references are not followed.
- Source files reached only through imports or `paths` aliases are not included when checking source/output overlap or expected outputs.
  Cleanup may delete those sources if they are inside `outDir`, or delete their emitted files as stale ([issue #2](https://github.com/michal-kocarek/tsc-after/issues/2)).
- Cleanup confinement and source/output overlap checks are incomplete.
  Do not rely on the current checks to protect valuable files.
- Handling of TypeScript configurations and emitted file types is incomplete and still needs verification.
- TypeScript 7.1 beta support is experimental and uses its native compiler API to determine outputs without writing them.
  Cleanup is refused when `noEmit` is enabled or emit is skipped.
  Package-based `extends` is not supported on TypeScript 7.1; use a relative or absolute config path instead.

Related open work: [configuration handling (#2)](https://github.com/michal-kocarek/tsc-after/issues/2), [incremental build state (#4)](https://github.com/michal-kocarek/tsc-after/issues/4), [cleanup safety (#6)](https://github.com/michal-kocarek/tsc-after/issues/6), and [output coverage (#7)](https://github.com/michal-kocarek/tsc-after/issues/7).

Planned: `--copy`, `--exclude`, and `--watch`.
See [`product.md`](./docs/product.md) for the roadmap.

## Requirements

- the project's tsconfig file must exist inside the current working directory (unlike `tsc`, it does not search parent directories for `tsconfig.json`)
- source code must be compiled in dedicated `outDir` path
- TypeScript 5.9.3 or 6.x, or TypeScript 7.1.0-beta through 7.x; TypeScript 7.0 is not supported
- TypeScript 7.1 beta requires its platform-specific native compiler package; use Node.js 22 or later for its published `tsc` command.
  The beta's `tsc` entrypoint fails on Node.js 16.20.2, 18.11.0, and 20.0.0 despite the package's Node.js 16.20.0 minimum.

## Exit codes

- `0` for success, including a dry run or nothing to remove
- `1` for a configuration or cleanup error
- `2` for invalid command-line arguments

## Why not `rm -rf dist && tsc`?

Wiping `outDir` before every build (`rm -rf dist && tsc`, `rimraf dist && tsc`, or a `prebuild` script) is the usual fix for stale outputs.
On GitHub, about 274k `package.json` files run `rm -rf dist` and another 199k run `rimraf dist` (see [`market-research.md`](./docs/market-research.md)).

`tsc-after` is intended to remove only stale outputs rather than wiping `outDir` and rebuilding everything.
Incremental builds are not supported.

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
