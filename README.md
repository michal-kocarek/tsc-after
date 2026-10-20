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
See [`PRODUCT.md`](./PRODUCT.md) for the roadmap.

## Why not `rm -rf dist && tsc`?

Wiping `outDir` before every build (`rm -rf dist && tsc`, `rimraf dist && tsc`, or a `prebuild` script) is the usual fix for stale outputs.
On GitHub, about 274k `package.json` files run `rm -rf dist` and another 199k run `rimraf dist` (see [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md)).
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

Using a bundler such as tsup, Vite, or esbuild?
They already clean up after themselves, so you probably don't need `tsc-after`.

## Contributing

See [`CONTRIBUTING.md`](./.github/CONTRIBUTING.md) and [`DEVELOPMENT.md`](./.github/DEVELOPMENT.md).

## Contributors

<!-- spellchecker: disable -->
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://github.com/michal-kocarek"><img src="https://avatars.githubusercontent.com/u/762095?v=4?s=100" width="100px;" alt="Michal Kočárek"/><br /><sub><b>Michal Kočárek</b></sub></a><br /><a href="https://github.com/michal-kocarek/tsc-after/commits?author=michal-kocarek" title="Code">💻</a> <a href="#content-michal-kocarek" title="Content">🖋</a> <a href="https://github.com/michal-kocarek/tsc-after/commits?author=michal-kocarek" title="Documentation">📖</a> <a href="#ideas-michal-kocarek" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-michal-kocarek" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-michal-kocarek" title="Maintenance">🚧</a> <a href="#projectManagement-michal-kocarek" title="Project Management">📆</a> <a href="#tool-michal-kocarek" title="Tools">🔧</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- spellchecker: enable -->
