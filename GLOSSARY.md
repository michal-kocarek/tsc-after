# tsc-after

Cleanup of stale outputs that `tsc` leaves behind in a project's `outDir`, and copying of files `tsc` doesn't emit.

## Language

**Project**:
A tsconfig file selected with `--project`, or the `tsconfig.json` in a selected directory.
_Avoid_: config, workspace

**Source files**:
The files in a project's program that `tsc` emits for: the root files and everything they import, except default libraries and external libraries.
_Avoid_: input files, root files (root files are only those matched by `files` and `include`)

**Outputs**:
The files `tsc` would write for a project's source files; also called _emitted files_, and writing them is _emit_.
_Avoid_: build artifacts, dist files

**Cleanup root**:
The `outDir`, or a `declarationDir` outside it, whose stale outputs `tsc-after` removes.
_Avoid_: target dir, clean dir

**Copy entry**:
One `--copy <source>:<destination>` pair, naming a copy source and a copy destination.
_Avoid_: copy rule, mapping

**Copy source**:
The file a copy entry reads, given relative to the current working directory and never inside a cleanup root.
_Avoid_: source file (source files are in the program)

**Copy destination**:
The file in `outDir` that a copy entry writes, given relative to `outDir`.
_Avoid_: copy target

**Stale outputs**:
Files in a cleanup root that are neither outputs of the current project nor copy destinations.
_Avoid_: orphans, leftovers

**Refusal**:
Stopping a run with exit code 1, before any file changes, because `tsc-after` cannot act safely.
Invalid arguments (exit code 2) and I/O failures during cleanup or copying are errors, not refusals.
_Avoid_: abort, failure
