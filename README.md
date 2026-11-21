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

In `package.json`, replace your build command:

Replace the clean-then-compile command with:

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

The project path must be inside the current working directory.
Positional arguments and unknown flags are rejected.

For a project with a dedicated `outDir`, `tsc-after` uses TypeScript to identify expected outputs, including those from files reached through imports and `paths` aliases.
It removes other regular files in `outDir` and directories left empty by cleanup.
If `declarationDir` is set outside `outDir`, it is cleaned separately; when nested in `outDir`, it is covered by that cleanup.
It skips symbolic links and entries on other devices.
This behavior and its safety limits are not yet verified for every TypeScript configuration or output type.

`--dry` lists planned removals without changing files.
Use `--verbose` to add individual removed and skipped entries.

## Limitations

- `outDir` must be set and dedicated to TypeScript outputs.
  Other regular files there, including copied assets, are treated as stale.
- `declarationDir` must also be dedicated to TypeScript outputs and requires `declaration` to be enabled.
- Cleanup is refused if a project source file or a config in its `extends` chain is inside either cleanup root.
- TypeScript 3.9 through 4.1 require `rootDir` to be set; cleanup is refused without it.
- Without `rootDir`, output layouts depend on the TypeScript version: TypeScript 5 and earlier use a common source directory, while TypeScript 6 and 7 use the config directory.
- By default, `tsc-after` reads `tsconfig.json` from the current directory and does not search parent directories.
- `incremental`, `tsBuildInfoFile`, `composite`, `outFile`, and watch configurations are rejected.
  Project references are not followed.
- Cleanup confinement and source/output overlap checks are incomplete.
  Do not rely on the current checks to protect valuable files.
- Handling of TypeScript configurations and emitted file types is incomplete and still needs verification.
- Cleanup is refused when `noEmit` is enabled, including in dry runs.
  `noEmitOnError` does not prevent cleanup; expected outputs for current source files are kept even when the project has errors.
- TypeScript 7.1 beta support is experimental and derives output paths without compiling the project.
  Package-based `extends` is not supported on TypeScript 7.1; use a relative or absolute config path instead.

Related open work: [configuration handling (#2)](https://github.com/michal-kocarek/tsc-after/issues/2), [incremental build state (#4)](https://github.com/michal-kocarek/tsc-after/issues/4), [cleanup safety (#6)](https://github.com/michal-kocarek/tsc-after/issues/6), and [output coverage (#7)](https://github.com/michal-kocarek/tsc-after/issues/7).

Planned: `--copy`, `--exclude`, and `--watch`.
See [`product.md`](./docs/product.md) for the roadmap.

## Requirements

- the project's tsconfig file must exist inside the current working directory (unlike `tsc`, it does not search parent directories for `tsconfig.json`)
- source code must be compiled in dedicated `outDir` path
- Node.js `^16.19.0 || >=18.11.0`.
- TypeScript 3.9.10+, 4.x–6.x, and 7.1.0-beta through 7.x are supported; TypeScript 7.0 is not.
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
