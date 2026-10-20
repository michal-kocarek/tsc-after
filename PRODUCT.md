# Product Brief: `tsc-after`

> **What comes after `tsc`: clean by default, copy when asked.**

`tsc` compiles your files, but it never deletes anything.
Rename `foo.ts` to `foo/index.ts` and `dist/foo.js` and `dist/foo.d.ts` live on forever — confusing your tests, your types, and your teammates. `tsc-after` reads your `tsconfig.json`, works out exactly which files `tsc` would emit today, and removes the ones it wouldn't.
Cleaning is enabled by default; a planned, opt-in `--copy` capability will copy additional artifacts into `outDir` (commonly `dist`).
Runs once after a build, or alongside `tsc --watch`.

This document captures the naming decision, positioning, and the full feature vision — sequenced into a **v1** that is worth shipping on its own and a **vNEXT** that follows.
It is a roadmap, not a list of implemented features; `--copy` is future work, not an available CLI option.
For the underlying market research, see [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md).

---

## Name

### Chosen: `tsc-after`

```sh
tsc && tsc-after
```

**Why it wins**

- **It describes when it runs.** `tsc && tsc-after` reads naturally as a post-build companion.
- **It covers both capabilities.** Cleaning is the default; `--copy` will opt into copying additional artifacts without making the name cleanup-only.
- **It's a compiler companion.** The `tsc-*` prefix places it next to `tsc-watch` (~3M downloads/month) and `tsc-alias` — tools people already reach for right after `tsc`.

The package and executable are both named `tsc-after`.
The earlier `tsc-clean` proposal and historical availability checks remain in [`MARKET_RESEARCH.md`](./MARKET_RESEARCH.md); they do not establish availability of `tsc-after`.
Verify that npm allows publishing under this name before releasing.

---

## Positioning

### Tagline

1. **"What comes after `tsc`: clean by default, copy when asked."** ← chosen
2. "Your source moved on.
   Let your `outDir` do the same."
3. "Deletes what `tsc` forgot to."
4. "Keep `outDir` honest."

### npm `description` (one line)

> Remove stale build output that `tsc` leaves behind when you delete or rename source files.
> Tsconfig-aware: just run `tsc && tsc-after`.

### Elevator paragraph (README intro)

> `tsc` compiles your files, but it never deletes anything.
> Rename `foo.ts` to `foo/index.ts` and `dist/foo.js` and `dist/foo.d.ts` live on forever — confusing your tests, your types, and your teammates. `tsc-after` reads your `tsconfig.json`, works out exactly which files `tsc` would emit today, and removes the ones it wouldn't.
> Cleaning is enabled by default; opt-in artifact copying via `--copy` is planned.
> Runs once after a build, or alongside `tsc --watch`.

### Tone

Friendly and a little playful, in the spirit of the Jest and Vitest READMEs — but always polite, inclusive, and precise about what the tool does and doesn't do.
A cleanup tool earns trust by being clear, not clever.

---

## Key Features

The list below is the whole picture, split into what a first release has to do to be worth installing (**v1**) and what makes it the obvious choice afterwards (**vNEXT**).
Nothing here is dropped — it's just sequenced, so something useful ships sooner.

### Capabilities

- **Clean (enabled by default):** Remove stale TypeScript build output using the selected tsconfig.
- **Copy (planned, opt-in via `--copy`):** Copy additional artifacts into the configured `outDir`, commonly `dist`.
  Artifact selection, configuration, destination mapping, overwrite behavior, and interaction with cleaning still need design before implementation.

### v1 promise

| #   | Feature                              | One-liner                                                                                                                                                                                                                           |
| :-- | :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Zero-config `tsconfig` awareness** | Resolves `outDir`, `rootDir`, `declarationDir`, `include`/`exclude`/`files`, `extends`, `allowJs`, `emitDeclarationOnly`, `noEmit` — via the TypeScript API, so it agrees with `tsc` by construction.                               |
| 2   | **Knows every emit**                 | `.ts/.tsx/.mts/.cts` (+ `.js/.jsx` with `allowJs`) → `.js/.mjs/.cjs`, `.d.ts/.d.mts/.d.cts`, `.js.map`, `.d.ts.map`.                                                                                                                |
| 3   | **Handles incremental builds**       | Leaves `.tsbuildinfo` alone so incremental builds stay fast.                                                                                                                                                                        |
| 4   | **Confined cleanup**                 | Treats `outDir` as TypeScript-owned: removes regular files outside the current emit set, while preserving compiler state such as `.tsbuildinfo`. Refuses unsafe output paths and source/output overlap; `--dry-run` shows the plan. |
| 5   | **Tidies up after itself**           | Removes directories left empty by the cleanup.                                                                                                                                                                                      |

### vNEXT promise

| #                                     | Feature                            | One-liner                                                                                                                                                                                  |
| :------------------------------------ | :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6                                     | **Watch mode**                     | `tsc-after --watch` runs next to `tsc --watch` (or `concurrently` / `tsc-watch --onSuccess` / `tsc-after -- ...` or script-friendly way), and survives rename/move storms with debouncing. |
| 7                                     | **Project references & monorepos** | `tsc-after -b` follows `references`/`composite` like `tsc -b`, cleaning every referenced project's `outDir`.                                                                               |
| 8                                     | **Boring where it matters**        | Cross-platform (Linux/macOS/Windows), Node LTS, tiny dependency footprint, MIT.                                                                                                            |
| Cross-tested with different versions. |
| 9                                     | **Fast**                           | Optimized for large codebases, huge amount of files                                                                                                                                        |
| 10                                    | **Programmatic API**               | `clean()`, `plan()`, `watch()` for custom build scripts and plugins — exposed once the internals are stable enough to promise.                                                             |
| 11                                    | **Explicit exclusions**            | A future `--exclude <glob>` option can protect selected paths in an otherwise TypeScript-owned `outDir`.                                                                                   |
| 12                                    | **Artifact copying**               | An opt-in `--copy` capability will copy additional artifacts into `outDir`; selection and cleanup interaction are still to be designed.                                                    |

---

## CLI Sketch

`outDir` must be dedicated to TypeScript output.
A stateless cleaner cannot tell an old compiler emit from an asset copied into the same directory: either file may be removed when it is absent from the current emit set.
Until `--copy` is implemented, copy assets **after** running `tsc-after`, or keep them in another directory.
A future `--exclude <glob>` option may support shared output directories; it is not part of v1.

```json
{
	"scripts": {
		"build": "tsc && tsc-after && cp assets/* dist/assets/"
	}
}
```

```sh
tsc && tsc-after                 # one-shot, clean enabled by default
tsc-after --dryRun               # show what would go, delete nothing
tsc-after -p tsconfig.build.json # pick a config
tsc-after -b                     # planned: follow project references
tsc-after --watch                # planned: companion to tsc --watch
tsc-after --verbose              # list every removed file
tsc-after --copy                 # planned: also copy additional artifacts; syntax TBD
```

Typical `package.json` wiring:

```json
{
	"scripts": {
		"build": "tsc && tsc-after",
		"dev": "concurrently \"tsc --watch\" \"tsc-after --watch\""
	}
}
```

---

## Non-goals

State these up front so nobody is surprised:

- **Not a general directory cleaner.** It compares files in a TypeScript-owned `outDir` with the current emit set; it is not intended for shared output directories.
- **Does not detect unused _source_ code.** That's the job of `knip` / `ts-prune`.
- **Not a bundler.** If you use tsup, Vite or esbuild, they already clean up after themselves — you probably don't need this.

---

## Publishing Checklist

- [ ] Verify that npm allows publishing package `tsc-after` and reserve the name.
- [ ] Rename the GitHub repository to `tsc-after`.
- [ ] Add `keywords` in `package.json`: `tsc`, `typescript`, `clean`, `outDir`, `dist`, `stale`, `orphan`, `build`, `watch`.
- [ ] Post a short note in TypeScript issue #16057 once v1 ships — that thread is where the audience already gathers.

## Additional random todo:

- [ ] When implementing, use node:util.parseArgs/parseEnv, if needed
- [ ] Re security, ban traversing above current tsconfig directory by default, also ban traversing symlinks and other filesystems if that's possible.
      Essentially limit to only process files
- [ ] Use same logic to determine what's the absolute path from relative in tsconfig, like typescript does
- [ ] Add conventional commits settings - IDEA, pre-commit, GitHub action
- [ ] Make repository public
- [ ] Publish correctly first version from github to npm directly with all bells and whistles to make it super secure
