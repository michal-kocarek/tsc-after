# End-to-end tests

- Keep E2E test files flat in this directory and group them by feature area.
- Name new files after the `tsc` feature they cover; keep `declarationDir` output comparisons in `emittedLayouts.e2e.test.ts` and `outFile` output tests in `staleOutputs.e2e.test.ts` until either needs its own file.
- Use one behavior per `it` and one named variant per `it.for` row; run each subprocess flow as its own test rather than looping over subprocess runs.
- Create each test's project with `withProject`.
  Most flows need at most one `tsc` and one `tsc-after`; use an explicit larger timeout when a flow runs multiple compiler commands to verify earlier cleanup.
- Use `CLEAN_MODES` or `withCleanModes` for normal and `--dry` variants.
- Reuse `fixtures/simple` and adjust it with helpers such as `writeJson`.
  Add a separate `fixtures/<name>/` directory and pass `fixtureDir` to `withProject` only when setup needs more than a few `writeJson` calls.
- Set `"types": []` in fixture tsconfigs and spread `ISOLATED_COMPILER_OPTIONS` from `project.ts` into `compilerOptions` written by tests.
  E2E projects live inside the repository, so this prevents `tsc` from automatically including repository `@types` packages that older supported TypeScript versions cannot parse.
- Compare `readTree(projectDir)` before and after cleanup to verify files and symbolic links are unchanged, and use `cliOutcome` to check failure results.
