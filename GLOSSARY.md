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

**Cleanup root**:
The `outDir`, or a `declarationDir` outside it, whose stale outputs `tsc-after` removes.
_Avoid_: target dir, clean dir

**Copy entry**:
One `--copy <source>:<destination>` pair.

**Copy destination**:
The file in `outDir` that a copy entry writes.

**Stale outputs**:
Files in a cleanup root that are neither outputs of the current project nor copy destinations.
_Avoid_: orphans, leftovers
