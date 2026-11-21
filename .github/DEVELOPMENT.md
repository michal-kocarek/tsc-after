# Development

After [forking the repo from GitHub](https://help.github.com/articles/fork-a-repo) and [installing pnpm](https://pnpm.io/installation):

```shell
git clone https://github.com/(your-name-here)/tsc-after
cd tsc-after
pnpm install
```

## Design standards

These standards apply to every change and are checked in review.
Runtime compiler work is limited to parsing configuration and building a program for parsing and module resolution; compiling is allowed only in tests.

- **No emit:** Derive output paths without calling `emit`, `emitToString`, `getJavaScriptEmit`, or `getDeclarationEmit`.
  Compiling adds unnecessary cost for a cleanup tool; ESLint rejects these member calls in production code.
- **No type checking:** Do not call `getTypeChecker`, `getSemanticDiagnostics`, or `getPreEmitDiagnostics`.
  Type checking adds unnecessary cost and is not needed to identify stale outputs; ESLint rejects these member calls in production code.
- **Parity with `tsc`:** Match the installed TypeScript version's output paths.
  Incorrect predictions can delete valid outputs; `emittedLayouts.e2e.test.ts` compares cleanup against `tsc --listEmittedFiles` across the supported version matrix.
- **Refuse rather than guess:** Refuse cleanup with a clear error when output paths cannot be derived reliably.
  This protects files from deletion when a configuration is unsupported; safety and comparison tests check refusals and preserved outputs.

## Building

Run [**tsdown**](https://tsdown.dev) locally to build source files from `src/` into output files in `lib/`:

```shell
pnpm build
```

Add `--watch` to run the builder in a watch mode that continuously cleans and recreates `lib/` as you save files:

```shell
pnpm build --watch
```

## Formatting

[Prettier](https://prettier.io) is used to format code.
It should be applied automatically when you save files in VS Code or make a Git commit.

To manually reformat all files, you can run:

```shell
pnpm format --write
```

## Linting

This package includes several forms of linting to enforce consistent code quality and styling.
Each should be shown in VS Code, and can be run manually on the command-line:

- `pnpm lint` ([ESLint](https://eslint.org) with [typescript-eslint](https://typescript-eslint.io)): Lints source files, including Bash scripts, JavaScript, Markdown, and TypeScript
- `pnpm lint:knip` ([knip](https://github.com/webpro/knip)): Detects unused files, dependencies, and code exports
- `pnpm lint:spelling` ([cspell](https://cspell.org)): Spell checks across all source files

Read the individual documentation for each linter to understand how it can be configured and used best.

For example, ESLint can be run with `--fix` to auto-fix some lint rule complaints:

```shell
pnpm run lint --fix
```

Note that you'll need to run `pnpm build` before `pnpm lint` so that lint rules which check the file system can pick up on any built files.

## Testing

[Vitest](https://vitest.dev) is used for tests.
Run source tests directly, or build the project before running end-to-end tests against the compiled CLI:

```shell
pnpm run test:unit
pnpm build
pnpm run test:e2e
```

For compatibility testing with another Node executable, set `TSC_AFTER_NODE_EXECUTABLE` and `TSC_AFTER_EXPECTED_NODE_VERSION`.
Both default to the Node version running Vitest:

```shell
TSC_AFTER_NODE_EXECUTABLE=/path/to/node TSC_AFTER_EXPECTED_NODE_VERSION=18.11.0 pnpm run test:e2e --run
```

The compatibility job runs end-to-end tests on the lowest supported version of each Node.js line with the locked TypeScript.
It also tests TypeScript 3.9.10 on Node.js 16.19.0, and TypeScript 7.1.0-beta on Node.js 22.0.0 and `.nvmrc`.
Those overridden TypeScript entries also run the version-gated compiler adapter unit tests in `src/common/typescript/__tests__/`.
See the comments in `.github/workflows/ci.yaml` for the pairing rationale and the source of truth for the matrix.
The Node.js floor is `^16.19.0 || >=18.11.0`, where `util.parseArgs()` gained `default`.
The TypeScript peer range is `>=3.9.10 <7 || >=7.1.0-beta <8`.
TypeScript 3.7 added `getOutputFileNames`, 3.8 added `watchOptions`, and 3.9 is the oldest version that passes the test suite unchanged; 3.9.10 is the latest patch of that release line.
To reproduce a matrix entry locally, build first with the locked development dependencies, then run both test suites through the TypeScript version helper:

```shell
pnpm build
TSC_AFTER_EXPECTED_TYPESCRIPT_VERSION=3.9.10 scripts/with-typescript-version 3.9.10 -- bash -c 'pnpm exec vitest run --project unit src/common/typescript/__tests__ && pnpm run test:e2e --run'
```

The helper keeps `package.json` and `pnpm-lock.yaml` modified for the duration of the command, then restores both files and reinstalls the locked dependencies when the command exits.
Do not run it concurrently with package-manager installs, edits to those files, or `pnpm clean`.
Testing a version does not by itself change the supported peer dependency range.

`pnpm run test` is an alias for the source tests.
Add the `--coverage` flag to compute source test coverage and place reports in the `coverage/` directory:

```shell
pnpm run test:unit --coverage
```

Note that [console-fail-test](https://github.com/JoshuaKGoldberg/console-fail-test) is enabled for all test runs.
Calls to `console.log`, `console.warn`, and other console methods will cause a test to fail.

Pass argument arrays directly to argument-parsing functions in tests instead of stubbing `process.argv` or making production parameters optional for test convenience.
When a test needs isolated process state, use `vi.stubGlobal("process", { ...process, ... })`; Vitest is configured to restore stubbed globals between tests, so keep the stub and code under test synchronous because tests in a file can run concurrently.

### End-to-end tests

Keep E2E test files flat in `src/__tests__/`, grouped by feature area:

- `project.e2e.test.ts` tests the isolated-project harness.
- `emittedLayouts.e2e.test.ts` compares expected outputs with `tsc --listEmittedFiles`.
- `staleOutputs.e2e.test.ts` tests stale output cleanup.
- `projectOption.e2e.test.ts` tests `--project` and config handling.
- `outDirSafety.e2e.test.ts` tests safety refusals involving `outDir`.
- `main.e2e.test.ts` tests CLI arguments, help, and version.

Name new files after the `tsc` feature they cover, such as `watch.e2e.test.ts` or `build.e2e.test.ts`.
Keep `declarationDir` output comparisons in `emittedLayouts.e2e.test.ts`; keep `tsBuildInfoFile` and `outFile` output tests in `staleOutputs.e2e.test.ts` until they need their own file.

Use one behavior per `it` and one named variant per `it.for` row; do not loop over subprocess runs inside a test.
Each test should create its own project with `withProject` and run at most one `tsc` and one `tsc-after`, keeping the default five-second timeout practical.
Use `CLEAN_MODES` or `withCleanModes` for normal and `--dry` variants.
The E2E project uses one worker and allows two concurrent tests to limit subprocess contention; both limits are configured in `vitest.config.ts`.

Reuse `src/__tests__/fixtures/simple` and adjust it in the test with helpers such as `writeJson`.
Add a separate `fixtures/<name>/` directory and pass `fixtureDir` to `withProject` only when setup needs more than a few `writeJson` calls.
Set `"types": []` in fixture tsconfigs and spread `ISOLATED_COMPILER_OPTIONS` from `src/__tests__/project.ts` into `compilerOptions` written by tests.
E2E projects live inside the repository, so without this isolation `tsc` automatically includes the repository's `@types` packages, which older supported TypeScript versions cannot parse.
Compare `readTree(projectDir)` before and after to check that files and symbolic links are unchanged, and use `cliOutcome` to check failure results.

## Type Checking

You should be able to see suggestions from [TypeScript](https://typescriptlang.org) in your editor for all open files.

However, it can be useful to run the TypeScript command-line (`tsc`) to type check all files in `src/`:

```shell
pnpm tsc
```

Add `--watch` to keep the type checker running in a watch mode that updates the display as you save files:

```shell
pnpm tsc --watch
```

## Releasing

Run **Actions → Release → Run workflow** on `main`.
Each dispatch runs the full CI workflow against the selected commit first; a release or dry run proceeds only if CI succeeds.
This checks the selected commit even if a separate push-triggered CI run has already passed.
Leave **Release version** blank to let [release-it](https://github.com/release-it/release-it) use the version from `package.json` as its current version and recommend an increment from [Conventional Commits](https://www.conventionalcommits.org) since the latest Git tag (`fix:` → patch, `feat:` → minor, breaking change → major).
The conventional-changelog plugin uses Git commits and tags for this recommendation; GitHub Releases are not its input.
The workflow keeps `package.json` at its current version until release-it updates it during a release.
To choose a version yourself, enter three numeric components such as `0.3.0` in **Release version**; prerelease and build metadata suffixes are not supported.
The workflow validates it and passes it to release-it as an explicit override.
The job name includes the supplied version.
An override controls the version number, not the changelog contents: review the commits and breaking changes regardless, and ensure the requested version is appropriate relative to the published package and Git tags.
Select **Dry run** to preview the version release-it selects and the actions it would perform without publishing; the job name marks the preview.
This uses the same branch and environment protections as a release.
To publish after reviewing the preview, run the workflow again with **Dry run** unchecked.
For a local, non-publishing preview, run `pnpm release 0.3.0 --ci --dry-run` with the version you intend to use; omit `0.3.0` to preview automatic selection.
The workflow updates `package.json` and `CHANGELOG.md`, commits and tags `vX.Y.Z`, creates a GitHub Release, and stages the package on npm.
See the preset's [default commit types](https://conventional-changelog.js.org/presets/conventional-commits/#default-commit-types) for which prefixes appear in the changelog.
Approve the staged version on npm with 2FA to make it installable.

The conventional-changelog plugin generates or updates `CHANGELOG.md` from commits and Git tags; it does not reconstruct the file from GitHub Releases.
If `CHANGELOG.md` is missing, it can be generated from that Git history, so deleting it is not a safe way to correct a bad entry: an incorrect local tag can produce incorrect version boundaries or entries again.
Keep valid published history, correct only the erroneous changelog entry, and before releasing verify that `package.json` and local tags agree with the versions actually published on npm and tagged in GitHub.
Do not run the workflow while the local package version or tags contain an unreconciled release version.

Git hooks run [commitlint](https://commitlint.js.org) on every new commit message and on all commits pushed to `main`.

npm authenticates the workflow through [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (no token) and adds provenance automatically.
The trusted publisher on npm must point to workflow `release.yaml` and environment `npm-release`.
