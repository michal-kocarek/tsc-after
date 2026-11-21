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
  Artifact selection, configuration, destination mapping, overwrite behavior, and interaction with cleaning still need design before implementation.

---

## CLI Sketch

`outDir` must be dedicated to TypeScript output.
A stateless cleaner cannot tell an old compiler emit from an asset copied into the same directory: either file may be removed when it is absent from the current emit set.
Until the planned v1 `--copy` capability is implemented, copy assets **after** running `tsc-after`, or keep them in another directory.
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
tsc-after --dry                  # show what would go, delete nothing
tsc-after -p tsconfig.build.json # pick a config
tsc-after -b                     # planned: follow project references
tsc-after --watch                # planned: companion to tsc --watch
tsc-after --verbose              # list every removed file
tsc-after --copy                 # planned: also copy additional artifacts; syntax TBD
tsc-after --noClean --copy       # planned: copy additional artifacts only
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
