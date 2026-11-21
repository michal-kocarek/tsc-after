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
> Unreleased prototype.
> Do not rely on it for builds yet.

## Usage

```sh
tsc && tsc-after # remove stale outputs from outDir
tsc-after --dry  # show what would be deleted
tsc-after -p tsconfig.build.json
```

`outDir` is treated as owned by TypeScript: any regular file there that `tsc` would not emit gets removed, including copied assets.
Copy assets _after_ cleanup (`tsc && tsc-after && cp assets/* dist/assets/`), or keep them in a separate directory.

Planned: `--copy`, `--exclude`, `--watch`, and project references.
See [`product.md`](./docs/product.md) for the roadmap.

## Requirements

- `tsconfig.json` must be present (unlike `tsc`, it does not search parent directories for `tsconfig.json`)
- source code must be compiled in dedicated `outDir` path

## Why not `rm -rf dist && tsc`?

Wiping `outDir` before every build (`rm -rf dist && tsc`, `rimraf dist && tsc`, or a `prebuild` script) is the usual fix for stale outputs.
On GitHub, about 274k `package.json` files run `rm -rf dist` and another 199k run `rimraf dist` (see [`market-research.md`](./docs/market-research.md)).
It works, but it costs more than it needs to:

|                           | `rm -rf dist && tsc`                                                                                                 | `tsc && tsc-after`                                             |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| Stale outputs             | Removed                                                                                                              | Removed                                                        |
| `incremental` builds      | Every file is emitted again; with `tsBuildInfoFile` outside `outDir`, `tsc` may even skip emitting the deleted files | Stay incremental: only changed files are emitted               |
| `outDir` during the build | Empty or half-written until `tsc` finishes, so anything reading it meanwhile breaks                                  | Complete: only stale outputs are removed, after `tsc` succeeds |
| Preview                   | None, everything goes                                                                                                | `tsc-after --dry` lists the stale outputs                      |

So if your `build` script starts with `rm -rf dist &&` or `rimraf dist &&`, drop it and add `&& tsc-after` at the end instead:

```diff
 {
 	"scripts": {
-		"build": "rm -rf dist && tsc"
+		"build": "tsc && tsc-after"
 	}
 }
```

**Using a bundler such as tsup, Vite, or esbuild?**<br>
They already clean up after themselves, so you probably don't need `tsc-after`.

## Contributing

See [`CONTRIBUTING.md`](./.github/CONTRIBUTING.md) and [`DEVELOPMENT.md`](./.github/DEVELOPMENT.md).

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
