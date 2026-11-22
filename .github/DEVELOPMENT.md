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
- **Validate before changing:** Planners (`resolveCleanupRoots`, `planCopy`, `planCleanup`) only read; apply steps (`applyCleanup`, `applyCopy`) run after every planner has succeeded.
  Run root-level checks before per-entry checks.
  A refusal then leaves the file system unchanged and reports the most basic problem first; e2e refusal tests assert an unchanged `readTree`.
- **Uniform error messages:** Write every error message as full sentences that end with a period, never `!`; `printError` adds the `error: ` prefix.
  Start refusals with `Refusing to <verb>`, then name the subject and the reason, e.g. `Refusing to copy 'src/x.json': it is inside outDir 'dist'.`
  Word invalid-argument errors like `tsc` (e.g. `Option '--noClean' cannot be specified without specifying option '--copy'.`), and pass TypeScript diagnostics through unchanged.
  Quote paths and values in single quotes, show paths relative to the current working directory with `displayPath`, and build repeated messages with small helpers in the module that throws them.
- **Uniform summaries:** Start every summary line with `tsc-after:`, and take dry-run and real-run verbs ("Would copy" and "Copied") from the shared `verbs` table in `mainAction.ts`.
  Check new output text against existing wording before adding it, since example strings in plans or issues are illustrations rather than specifications.

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

Every entry of the CI test job runs the full unit and end-to-end suites.
The entries cover the locked TypeScript on Ubuntu and Windows, and on the lowest supported version of each Node.js line.
They also cover TypeScript 3.9.10 on Node.js 16.19.0, and TypeScript 7.1.0-beta on Node.js 22.0.0, `.nvmrc`, and Windows.
Vitest always runs on `.nvmrc`; the Node.js entry selects the Node.js that runs `tsc` and `tsc-after`.
See the comments in `.github/workflows/ci.yaml` for the pairing rationale and the source of truth for the matrix.
The `main branch required checks` ruleset requires `CI Gate` and `Conventional title`; `CI Gate` fails unless every job in its `needs` succeeds, so add each CI job that should block merging to its `needs` instead of listing it in the ruleset.
Repository admins and deploy keys can bypass both checks on PRs and direct pushes, so use the bypass only when the checks cannot run.
The non-required `Codecov` job runs after `CI Gate`, including on failure, and needs no change when gated jobs are added.
The Node.js floor is `^16.19.0 || >=18.11.0`, where `util.parseArgs()` gained `default`.
The TypeScript peer range is `>=3.9.10 <7 || >=7.1.0-beta <8`.
TypeScript 3.7 added `getOutputFileNames`, 3.8 added `watchOptions`, and 3.9 is the oldest version that passes the test suite unchanged; 3.9.10 is the latest patch of that release line.
To reproduce a matrix entry locally, run both test suites through the TypeScript version helper:

```shell
TSC_AFTER_EXPECTED_TYPESCRIPT_VERSION=3.9.10 scripts/with-typescript-version 3.9.10 -- bash -c 'pnpm run test:unit --run && pnpm run test:e2e --run'
```

The helper puts the snapshot's `node_modules/.bin` first on `PATH`, but pnpm can select a colliding binary such as `typescript-7` for bare `tsc`.
Commands that need the requested compiler should resolve `typescript` from the snapshot instead of relying on `tsc` from `PATH`.
Each invocation copies the Git-selected working tree into its own fresh `.tmp` workspace and runs the command there.
Run only one E2E suite at a time because Vitest already runs compiler-spawning E2E tests concurrently.
Run `pnpm clean` only after all helper invocations have exited.
Testing a version does not by itself change the supported peer dependency range.

### Diagnosing CI failures

Find `RUN_ID` after `/runs/` in the run URL, and `JOB_ID` after `/job/`.
For a recently pushed commit, list its runs, including those still in progress:

```shell
gh run list --commit "$(git rev-parse HEAD)"
```

A run takes several minutes, so triage each failed job as soon as it finishes instead of waiting for the whole run; every command below except `--log-failed` works on an in-progress run.
Start with the run summary, which lists failed jobs and Vitest annotations with each failed test's file, line, and error:

```shell
gh run view "$RUN_ID"
```

The run summary may omit the test name; query the annotations API for the complete annotations of one job:

```shell
gh api "repos/michal-kocarek/tsc-after/check-runs/$JOB_ID/annotations"
```

`gh run view --log-failed` works after the entire run finishes:

```shell
gh run view "$RUN_ID" --log-failed
```

While a run is in progress, retrieve logs for a finished job directly:

```shell
gh api --allow-escape-sequences "repos/michal-kocarek/tsc-after/actions/jobs/$JOB_ID/logs"
```

Each test matrix entry uploads a one-day artifact with Vitest JSON and JUnit reports for every test run, when available.
On failure, the artifact also contains `environment.json`.
The environment report records the runner image, Node.js and TypeScript versions, CPUs, memory, load averages, disk space, temporary directory paths, and file name case sensitivity.
Each entry also uploads its LCOV coverage when available, and `check` uploads the built `dist/`; the `Codecov` job collects these artifacts for coverage, test analytics, and bundle analysis.
Download the artifacts uploaded so far with:

```shell
gh run download "$RUN_ID"
```

CI sets `TEST_RESULTS_DIR` to turn on these reports; `vitest.config.ts` writes them there.

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

Place E2E tests in `src/__tests__/`.
For E2E test authoring conventions, see [`src/__tests__/AGENTS.md`](../src/__tests__/AGENTS.md).

The E2E project uses one worker and allows two concurrent tests in CI or three locally, as configured in `vitest.config.ts`.
E2E tests run `tsc` and `tsc-after` subprocesses, so excessive parallelism can starve CPU on resource-constrained GitHub Actions runners and cause timeouts.
Keeping one worker prevents concurrent test limits from multiplying across files.
For different local limits, adjust the E2E project's `maxConcurrency` in `vitest.config.ts`; higher values may cause timeouts.
Vitest's `--maxConcurrency` flag does not override this project-level setting.

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

## Merging pull requests

Squash is the only enabled merge method.
Follow the title and blank-body guidance in [CONTRIBUTING.md](./CONTRIBUTING.md), check that `Conventional title` passed, and preserve the title in the merge dialog.
Include any `Co-authored-by:` lines needed to credit other authors.
Auto-merge and branch-update suggestions are enabled, but branches do not need to be up to date before merging.
The `main branch is immutable` ruleset prevents deletion, force pushes, and merge commits; ordinary direct pushes remain allowed.
The signature ruleset permits repository admins to bypass signatures for PR merges, without guaranteeing the resulting commit is signed; direct pushes need signed commits except when using a deploy key.
The `v*` tag rulesets let deploy keys create tags and prevent everyone, including deploy keys, from updating or deleting them.
Conversation resolution is not required because GitHub couples that ruleset option to requiring PRs, which would block direct pushes.

## Releasing

Run **Actions → Release → Run workflow** on `main`.
The release job requires a successful `CI Gate` from a `push` run on `main` for the exact selected commit before publishing.
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

The PR-title check in `.github/workflows/pr-title.yaml` uses `pull_request_target` so it can validate title edits, but checks out only the trusted default branch and never PR code.
Keep its GitHub Actions event policy scoped to that workflow, and do not fetch or execute pull-request content in it.
The check validates the PR title, not the final squash message, which GitHub lets the merger edit; preserve the checked title when merging.

npm authenticates the workflow through [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (no token) and adds provenance automatically.
The trusted publisher on npm must point to workflow `release.yaml` and environment `npm-release`.
