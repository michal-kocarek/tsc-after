# Agent guidance

- Apply KISS and SOLID pragmatically; add abstractions only when they simplify the code at hand.
- Avoid duplication, extract magic constants.
- When creating a new file, `git add` it.

## Naming

This tool is a companion to `tsc`, so mirror its vocabulary in identifiers, CLI flags, help text, messages, and docs.
Before naming something new, check for an existing term in `pnpm exec tsc --help --all` and `pnpm exec tsc --build --help`.

- For anything that maps to a compiler option, use the option name: `outDir`, `rootDir`, `declarationDir`, `outFile`, `tsBuildInfoFile`, `composite`, `incremental`.
  Don't use made-up names like "dist", "build dir", or "output folder" for `outDir`; `dist` is only an example value in user-facing docs.
- Use these domain terms consistently:
  - _project_: what `--project`/`-p` selects (a tsconfig file, or a folder with a `tsconfig.json`).
  - _source files_: the project's input files (`ParsedCommandLine.fileNames`).
  - _emit_ / _emitted files_ / _outputs_: what `tsc` writes for the source files (`ts.getOutputFileNames`).
  - _stale outputs_ (this project's own term): files in `outDir` that the current project would not emit.
- When the TypeScript compiler API (`ts.*`) already has a name for something, use that name for identifiers (e.g. `options`, `fileNames`, `useCaseSensitiveFileNames`).
  Abbreviate "directory" as `Dir`, the way `tsc` does in `outDir` and `rootDir` (e.g. `dirPath`, not `folderPath`).
- CLI flags use camelCase.
  Reuse a `tsc` flag name or short alias only when the meaning is the same (`--project`/`-p`, `--help`/`-h`, `--verbose`, `--watch`/`-w`), and never give a `tsc` flag name a different behavior.
- Write help descriptions the way `tsc` does: one imperative sentence ending with a period, e.g. "Print this message.".

## Testing

- Tests use Vitest and live in `__tests__` next to the code: `*.unit.test.ts` for unit tests, `*.e2e.test.ts` for end-to-end tests.
- Use `expect` from the test context (`it("...", ({ expect }) => { ... })`), not the global one.
- In unit tests, root-level `describe(fn, ...)` blocks test the module's exported functions, one block per function (pass the function itself, not its name as a string).
- Avoid excessive mocking; prefer testing real behavior.
  Mock only at the boundaries (e.g. `console.*`, filesystem, process), not the project's own modules.
  If you see too much of mocks, stop and propose to convert test case to higher-level tests.
- Tests fail on any console output (`console-fail-test`).
  To test printed output, spy on the console method and capture it: `using log = vi.spyOn(console, "log").mockReturnValue();`.
- Test files are isolated (own modules and globals); tests within a file run concurrently (`sequence.concurrent`).
- For snapshots of CLI output, strip colors with `stripVTControlCharacters` from `node:util`.
- `CI=1` is set, so Vitest won't write new snapshots; create or update them explicitly with `vitest run -u` and review the result.
