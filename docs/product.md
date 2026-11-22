# Product Brief: `tsc-after`

> **Your `dist`, as `tsc` should've left it.**

`tsc` compiles your files, but it never deletes anything.
Rename `foo.ts` to `foo/index.ts` and `dist/foo.js` and `dist/foo.d.ts` live on forever — confusing your tests, your types, and your teammates. `tsc-after` reads your `tsconfig.json`, works out exactly which files `tsc` would emit today, and removes the ones it wouldn't.
Cleaning is enabled by default; an opt-in `--copy` capability to copy additional artifacts into `outDir` (commonly `dist`) is planned for v1.
Runs once after a build, or alongside `tsc --watch`.

This document captures the naming decision, positioning, and feature vision.
It is not a list of implemented features; `--copy` is planned for v1, but is not an available CLI option yet.
The published `0.2.0` is an experimental release; the [v1 milestone](https://github.com/michal-kocarek/tsc-after/milestone/1) tracks the first stable release and its follow-ups, while the [vNext milestone](https://github.com/michal-kocarek/tsc-after/milestone/2) holds later ideas.
For the underlying market research, see [`market-research.md`](./market-research.md).

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
The earlier `tsc-clean` proposal and historical availability checks remain in [`market-research.md`](./market-research.md); they do not establish availability of `tsc-after`.
The package is published on npm as `tsc-after`; verify the package and release state before publishing future versions.

---

## Positioning

### Tagline

1. **"Your `dist`, as `tsc` should've left it."** ← chosen
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
> Cleaning is enabled by default; opt-in artifact copying via `--copy` is planned for v1.
> Runs once after a build, or alongside `tsc --watch`.

### Tone

Friendly and a little playful, in the spirit of the Jest and Vitest READMEs — but always polite, inclusive, and precise about what the tool does and doesn't do.
A cleanup tool earns trust by being clear, not clever.

---

## Key Features

The capabilities below describe the product vision; the v1 milestone tracks the work for the first release.

### Capabilities

- **Clean (enabled by default):** Remove stale TypeScript build output using the selected tsconfig.
- **Copy (planned for v1, opt-in via `--copy`):** Copy additional artifacts into the configured `outDir`, commonly `dist`.
  See [Copy design (v1)](#copy-design-v1) for the agreed behavior and [Post-v1 ideas](#post-v1-ideas) for what is deliberately left out.

---

## CLI Sketch

`outDir` must be dedicated to TypeScript output.
A stateless cleaner cannot tell an old compiler emit from an asset copied into the same directory: either file may be removed when it is absent from the current emit set.
Until the planned v1 `--copy` capability is implemented, copy assets **after** running `tsc-after`, or keep them in another directory.
Once it ships, files copied with `--copy` count as expected outputs, so cleanup keeps them.
A future `--exclude <glob>` option may support shared output directories; it is not part of v1.

```json
{
	"scripts": {
		"build": "tsc && tsc-after && cp assets/* dist/assets/"
	}
}
```

```sh
tsc && tsc-after                                       # one-shot, clean enabled by default
tsc-after --dry                                        # show what would go, delete nothing
tsc-after -p tsconfig.build.json                       # pick a config
tsc-after -b                                           # planned: follow project references
tsc-after --watch                                      # planned: companion to tsc --watch
tsc-after --verbose                                    # list every removed file
tsc-after --copy src/schema.json:schema.json           # planned: clean, then copy
tsc-after --noClean --copy src/schema.json:schema.json # planned: copy only
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

### Exit codes

- `0` for success, including a dry run or nothing to remove
- `1` for a configuration or cleanup error
- `2` for invalid command-line arguments

---

## Copy design (v1)

Status: agreed design for [#3](https://github.com/michal-kocarek/tsc-after/issues/3), not implemented yet.

### Use cases

`--copy` is for a few specific files that `tsc` won't emit but the built package still needs:

1. Runtime assets the code loads relative to itself, e.g. `schema.json`, `*.sql`, or `.wasm` files read with `new URL("./x", import.meta.url)`.
2. Hand-written declarations, e.g. `src/legacy.d.ts`; `tsc` never copies `.d.ts` inputs.
3. Non-TS module files such as CSS or SVG imported by a library and resolved by a downstream bundler.
4. Package-level files such as `README.md` or `LICENSE` when publishing from `outDir`.

### Syntax

```sh
tsc && tsc-after --copy src/schema.json:schema.json --copy README.md:README.md
```

- `--copy <source>:<destination>` is repeatable; each entry copies exactly one file.
- The entry is split on its last `:`.
- `<source>` is resolved from the current working directory, like other paths given on the `tsc` command line (e.g. `--project`).
  It must be a regular file inside the current working directory and outside `outDir`.
- `<destination>` is a file path relative to `outDir`.
  It must not be absolute or contain `..`, so copies never leave `outDir`.
- No globs, no directories, and no shorthand without `<destination>` in v1.
  Each of these can be added later without breaking existing commands.
- Help text: "Copy a file to a path relative to 'outDir', given as '<source>:<destination>'."

### Interaction with cleaning

- Copy destinations count as expected outputs, together with the files `tsc` would emit.
- Removing a `--copy` entry is not an error: its destination becomes a stale output and the next cleanup removes it.
  With `--noClean`, the old copy is left in place.
- `tsc-after` stays stateless: it does not remember earlier copies, so an old copy is treated like any other stale output.
- `--noClean` without `--copy` is invalid command-line usage (exit `2`), because there is nothing to do.

### Execution

- Plan everything, validate everything, then clean, then copy.
  Any error stops the run before a single file is changed.
- A destination whose content already matches its source is skipped, so its modification time stays the same.
- `--dry` prints `Would copy file: src/schema.json -> dist/schema.json`; `--verbose` lists each copied and skipped file.
- The summary covers both tasks, e.g. `tsc-after: Copied 2 files and removed 1 file from dist`.

### Errors (exit `1`, nothing changed)

- The source is missing, is not a regular file, is outside the current working directory, or is inside `outDir`.
- The destination is absolute or contains `..`.
- Two entries share a destination, compared case-insensitively when the file system is case-insensitive.
- A destination is also a file `tsc` would emit, e.g. a `.json` file with `resolveJsonModule`.
- A destination is a directory, a symbolic link, another non-regular entry, or a path through a symbolic link.
- Everything that already makes cleanup refuse to run (`noEmit`, missing `outDir`, source/output overlap) also applies to copying.

---

## Post-v1 ideas

Ideas for the [vNext milestone](https://github.com/michal-kocarek/tsc-after/milestone/2); none of them are committed.

- **Shorthand without a destination:** `--copy src/legacy.d.ts` maps through the effective `rootDir`, the same way `tsc` maps source files to `outDir`.
  Depends on exposing the effective `rootDir` from the compiler adapters, which relates to [#2](https://github.com/michal-kocarek/tsc-after/issues/2).
- **Globs:** `include`-style wildcards (`*`, `?`, `**/`) mapped through `rootDir`.
  Open points: whether a pattern that matches nothing is an error, and whether to write a small matcher or add a dependency (Node.js 16 has no built-in `fs.glob`).
- **Directories:** copying a directory recursively, with rules for symbolic links and exclusions.
- **Copy exclusions:** named so they don't clash with the planned cleanup `--exclude`.
- **Configuration file** for longer lists and globs, where paths are resolved from the file that declares them:
  - a `package.json` key: simple, but per package rather than per tsconfig;
  - a custom tsconfig key: fits `-p tsconfig.build.json` best, but `extends` does not merge it automatically;
  - a separate `tsc-after.config.json`: the most flexible, but one more file.

  Entries map to `{ "from": "...", "to": "..." }`, so v1 command-line pairs translate directly.

---

## Non-goals

State these up front so nobody is surprised:

- **Not a general directory cleaner.** It compares files in a TypeScript-owned `outDir` with the current emit set; it is not intended for shared output directories.
- **Does not detect unused _source_ code.** That's the job of `knip` / `ts-prune`.
- **Not a bundler.** If you use tsup, Vite or esbuild, they already clean up after themselves — you probably don't need this.

---
