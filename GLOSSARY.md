# tsc-after

Cleanup of stale outputs that `tsc` leaves behind in a project's `outDir`.

## Language

**Project**:
A tsconfig file selected with `--project`, or the `tsconfig.json` in a selected folder.
_Avoid_: config, workspace

**Source files**:
The files in a project's program that `tsc` emits for: the root files and everything they import, except default libraries and external libraries.
_Avoid_: input files, root files (root files are only those matched by `files` and `include`)

**Outputs**:
The files `tsc` would write for a project's source files; also called _emitted files_, and writing them is _emit_.
_Avoid_: build artifacts, dist files

**Stale outputs**:
Files in `outDir` that the current project would not emit.
_Avoid_: orphans, leftovers
