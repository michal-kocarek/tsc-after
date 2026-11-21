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

> [!WARNING]
> Published on npm as `0.2.0`, but this README describes the current development source, whose CLI differs from the published package (for example, `--dry` here is `--dryRun` in `0.2.0`).
> The published release and current source are experimental, not production-ready.
> Do not add it to build scripts or run it against valuable output yet.
> Cleanup is destructive: regular files in `outDir` that TypeScript does not identify as current outputs are removed, including copied assets.
> Configuration support and cleanup safety are incomplete; review the limitations below and preview first.

## Usage

```sh
# Current development source: preview for tsconfig.json; --verbose lists individual paths.
tsc-after --dry --verbose

# Current development source: select a tsconfig file instead of the default.
tsc-after --project tsconfig.build.json
```

For a basic project with a dedicated `outDir`, `tsc-after` uses TypeScript's output-name API to identify expected outputs, removes other regular files in `outDir`, and removes directories left empty by cleanup.
It skips symbolic links and entries on other devices.
This behavior and its safety limits are not yet verified for every TypeScript configuration or output type.

`--dry` leaves files unchanged, but individual paths are currently printed only with `--verbose`; its summary also reports zero files removed rather than counting planned removals ([issue #8](https://github.com/michal-kocarek/tsc-after/issues/8)).

## Limitations

- `outDir` must be set and dedicated to TypeScript outputs.
  Other regular files there, including copied assets, are treated as stale.
- `--project` currently selects a tsconfig file; selecting a project directory is not supported.
  By default, it reads `tsconfig.json` from the current directory and does not search parent directories.
- `incremental`, `tsBuildInfoFile`, `composite`, `declarationDir`, and watch configurations are rejected.
  Project references are not followed.
- Cleanup confinement and source/output overlap checks are incomplete.
  Do not rely on the current checks to protect valuable files.
- Handling of TypeScript configurations and emitted file types is incomplete and still needs verification.

Related open work: [configuration handling (#2)](https://github.com/michal-kocarek/tsc-after/issues/2), [incremental build state (#4)](https://github.com/michal-kocarek/tsc-after/issues/4), [cleanup safety (#6)](https://github.com/michal-kocarek/tsc-after/issues/6), and [output coverage (#7)](https://github.com/michal-kocarek/tsc-after/issues/7).

Planned: `--copy`, `--exclude`, and `--watch`.
See [`product.md`](./docs/product.md) for the roadmap.

## Requirements

- `tsconfig.json` must be present (unlike `tsc`, it does not search parent directories for `tsconfig.json`)
- source code must be compiled in dedicated `outDir` path

## Exit codes

- `0` for success, including a dry run or nothing to remove
- `1` for a configuration or cleanup error
- `2` for invalid command-line arguments

## Why not `rm -rf dist && tsc`?

Wiping `outDir` before every build (`rm -rf dist && tsc`, `rimraf dist && tsc`, or a `prebuild` script) is the usual fix for stale outputs.
On GitHub, about 274k `package.json` files run `rm -rf dist` and another 199k run `rimraf dist` (see [`market-research.md`](./docs/market-research.md)).
`tsc-after` is intended to remove only stale outputs rather than wiping `outDir` and rebuilding everything.
The prototype is not yet a safe replacement for that workflow: configuration support and cleanup safeguards are incomplete, and incremental builds are not supported.
Do not add it to a build script yet.

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
