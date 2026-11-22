# Agent guidance

- Apply KISS and SOLID pragmatically; add abstractions only when they simplify the code at hand.
- Avoid duplication, extract magic constants.
- When creating a new file, `git add` it.

## Code layout

- `src/entrypoints/`: command-line entrypoints.
- `src/tasks/`: main actions an entrypoint runs (`mainAction`, `help`, `version`).
- `src/common/`: shared helpers and everything else.

## Code style

- Handle paths through `src/common/paths.ts`: `displayPath` for paths shown to users, `lstatIfExists` for entries that may be missing, and `normalizePathForComparison` or `isPathInside` for comparisons, which respect `useCaseSensitiveFileNames`.
- Pass an options object once a function takes several arguments of the same type, such as predicates.
- Narrow `Pick<Project, …>` parameters to the fields the function reads.
- Resolve each item once into a record that carries everything later stages need, instead of pairing parallel arrays by index.
- Type a closed set of strings as a literal union (e.g. `SkipReason`), and export a named type for each shared shape (e.g. `CleanupPlan`).
- Apply steps return `void` unless they produce new data.
- Keep each doc comment directly above the declaration it describes.
  When a check is correct only because of a guarantee made elsewhere, state that guarantee in a one-line comment at the check.

## TypeScript compiler API

- For compiler, cleanup, copy, or CLI output changes, follow the [Design standards](.github/DEVELOPMENT.md#design-standards).
- Initialize the TypeScript 7.1 beta `typescript/sync` API (for example, with `api.parseCommandLine([])`) before calling `getCanonicalFileName`; otherwise it throws `API has not been initialized` instead of providing case-sensitivity information.

## Type assertions

- Avoid TypeScript type assertions, including `as Type`, angle-bracket assertions, and chained assertions such as `as unknown as Type`; use narrowing, correctly typed values, or runtime validation instead. `as const` is allowed because it preserves literal types without claiming a different runtime shape.
  If an assertion seems unavoidable, pause and explain to the user why, which safer alternatives you considered, and how the design could avoid it; ask how to proceed before adding it.

## Issues

- Issues and milestones are tracked in [GitHub](https://github.com/michal-kocarek/tsc-after) (the `origin` remote).
- Treat references such as `#14` as GitHub issue numbers; read them with GitHub tools or `gh issue view <number>`.
- Before closing a ticket, update `README.md` following [README](#readme); if no README change is warranted, explain why in the completion summary.

## README

`tsc-after` aims to follow tsconfig and `tsc` semantics exactly, so readers take them as given.
`README.md` documents only _deviations_: what `tsc-after` refuses, doesn't support yet, or does beyond `tsc`.

- Before writing about a behavior, ask whether `tsc` already behaves that way (output layout without `rootDir`, option prerequisites like `declarationDir` needing `declaration`, `noEmitOnError`, module resolution, TypeScript's own runtime requirements); if it does, it's no deviation, so leave it to TypeScript's docs.
- Write each deviation once, in one short line, in the section it belongs to; link its open issue on that line.
- A delivered feature removes or narrows a deviation; it adds one only when it introduces a new refusal.

## Agent documentation

- Before creating or editing agent-facing documentation, use the installed `writing-for-agents` skill from [Matt Pocock's skills collection](https://github.com/mattpocock/skills/).
  If it is unavailable, tell the user and ask permission before downloading the skill directly from GitHub as a last resort.

## Naming

This tool is a companion to `tsc`, so mirror its vocabulary in identifiers, CLI flags, help text, messages, and docs.
Before naming something new, check for an existing term in `pnpm exec tsc --help --all` and `pnpm exec tsc --build --help`.

- For anything that maps to a compiler option, use the option name: `outDir`, `rootDir`, `declarationDir`, `outFile`, `tsBuildInfoFile`, `composite`, `incremental`.
  Don't use made-up names like "dist", "build dir", or "output folder" for `outDir`; `dist` is only an example value in user-facing docs.
- Name domain concepts with the terms in [`GLOSSARY.md`](GLOSSARY.md).
- When the TypeScript compiler API (`ts.*`) already has a name for something, use that name for identifiers (e.g. `options`, `fileNames`, `useCaseSensitiveFileNames`).
  Abbreviate "directory" as `Dir`, the way `tsc` does in `outDir` and `rootDir` (e.g. `dirPath`, not `folderPath`).
- CLI flags use camelCase.
  Reuse a `tsc` flag name or short alias only when the meaning is the same (`--project`/`-p`, `--help`/`-h`, `--verbose`, `--watch`/`-w`), and never give a `tsc` flag name a different behavior.
- Write help descriptions the way `tsc` does: one imperative sentence ending with a period, e.g. "Print this message.".

## Formatting and linting

- After editing files, fix them instead of only checking them: run `pnpm exec prettier --write <files>` and `pnpm exec eslint --fix <files>` on the files you changed, then review the diff and resolve the remaining ESLint errors.
  Pass only the files you changed; `pnpm lint --fix` fixes the whole repository.
- Try to write Markdown with one sentence per line; `prettier-plugin-sentences-per-line` reformats it anyway.
- Run knip only through `pnpm lint:knip`; running it directly crashes.

## Testing

- For development or testing workflow details, consult [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).
- For CI failure triage, follow [Diagnosing CI failures](.github/DEVELOPMENT.md#diagnosing-ci-failures).
- Run `pnpm typecheck` when validating code changes; `pnpm build` uses tsdown and does not typecheck.
- Tests use Vitest and live in `__tests__` next to the code: `*.unit.test.ts` for unit tests, `*.e2e.test.ts` for end-to-end tests.
- When running or writing E2E tests, including work outside `src/__tests__/`, follow [`src/__tests__/AGENTS.md`](src/__tests__/AGENTS.md).
- Use `expect` from the test context (`it("...", ({ expect }) => { ... })`), not the global one.
- In unit tests, root-level `describe(fn, ...)` blocks test the module's exported functions, one block per function (pass the function itself, not its name as a string).
- Avoid excessive mocking; prefer testing real behavior.
  Mock only at the boundaries (e.g. `console.*`, filesystem, process), not the project's own modules.
  If you see too much of mocks, stop and propose to convert test case to higher-level tests.
- Don't make production arguments optional solely to simplify tests; pass test inputs explicitly.
- Tests fail on any console output (`console-fail-test`).
  To test printed output, spy on the console method and capture it: `using log = vi.spyOn(console, "log").mockReturnValue();`.
- Test files are isolated (own modules and globals); tests within a file run concurrently (`sequence.concurrent`).
- For snapshots of CLI output, strip colors with `stripVTControlCharacters` from `node:util`.
- `CI=1` is set, so Vitest won't write new snapshots; create or update them explicitly with `vitest run -u` and review the result.

## Branches

When asked to name a branch, use a short kebab-case description, prefixed with the issue number when present (e.g. `14-typescript-version-snapshot` or `typescript-version-snapshot`).

## Commits

When committing, follow the [Conventional Commit guidance](.github/CONTRIBUTING.md#sending-a-pull-request) and [formatting and hook guidance](.github/DEVELOPMENT.md#formatting).
Let Git hooks run, then review any formatting changes they make.
Bypass hooks (`--no-verify`, `HUSKY=0`) only with the user's explicit permission.

## Agent skills

### Issue tracker

Create and manage issues for this repository in GitHub Issues with `gh`.
See `docs/agents/issue-tracker.md`.

### Domain docs

For domain terminology and architectural decisions, follow the single-context glossary and ADR guidance in `docs/agents/domain.md`.
