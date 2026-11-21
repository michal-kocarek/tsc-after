# Domain docs

How engineering skills should consume this repository's domain documentation while exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repository root, if it exists.
- **`docs/adr/`** for architectural decisions that touch the area being explored.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront; create them only when domain terms or decisions are resolved through the relevant domain-modeling work.

## File structure

This is a single-context repository:

```text
/
├── GLOSSARY.md
├── docs/adr/
│   └── <decision records>
└── src/
```

## Use the glossary's vocabulary

When output names a domain concept (for example, in an issue title, refactor proposal, hypothesis, or test name), use the term defined in `GLOSSARY.md`. Do not substitute synonyms that the glossary explicitly avoids. If a needed concept is missing, reconsider whether the project uses that term or note the gap for domain modeling.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it, for example:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
