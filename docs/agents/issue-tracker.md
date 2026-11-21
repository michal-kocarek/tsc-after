# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues.
Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
  Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). On older `gh`, use `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`.
  Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Block an issue**: GitHub's native issue dependencies are the canonical, UI-visible representation.
  Add an edge with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+). On older `gh`, use `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric database ID, not its issue number or node ID.
  If dependencies are unavailable, put `Blocked by: #<n>, #<n>` at the top of the child body.
  An issue is unblocked when every blocker is closed.
- **Count open blockers**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` counts open blockers. `gh issue view <n> --json blockedBy` also includes closed blockers; filter with `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` / `gh issue edit <number> --remove-label "..."`.
  Before using a label-based workflow, verify that its labels exist; this setup does not create labels.
- **Close an issue**: post the explanation with `gh issue comment <number> --body "..."`, then run `gh issue close <number>`.
  On an already-closed issue, `gh issue close --comment` drops the comment and still exits 0.

Infer the repository from `git remote -v`; `gh` does this automatically inside this clone.
File issues only in the user's own repository.
Before the first issue creation in a session, check the target with `gh repo view --json nameWithOwner`; in a fork, `gh` can default to the upstream parent, so confirm the target if it is not the user's repository.

## Pull requests as a request surface

**PRs as a request surface: no.** Set this to `yes` only if this repository treats external PRs as feature requests; triage workflows can then process PRs using the `gh pr` equivalents.

- **Read a PR**: `gh pr view <number>`, then `gh pr view <number> --comments` for comments and `gh pr diff <number>` for its diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment, label, or close**: use `gh pr comment`, `gh pr edit --add-label` / `--remove-label`, or `gh pr close`.

GitHub shares one number space across issues and PRs.
A bare `#42` may refer to either; resolve it with `gh pr view 42` and fall back to `gh issue view 42` if it is not a PR.

## When a skill says “publish to the issue tracker”

Create a GitHub issue.

## When a skill says “fetch the relevant ticket”

Read it with `gh issue view <number>` as described above.

## Wayfinding operations

The map is a single issue with child issues as tickets.
Use `wayfinder:*` labels only if they already exist; this setup does not create them.

- **Map**: a single issue holding the Notes / Decisions-so-far / Fog body.
  The `wayfinder:map` label is optional and should be used only if present.
- **Child ticket**: link it to the map as a GitHub sub-issue.
  Where sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body.
  A `wayfinder:<type>` label (`research`, `prototype`, `grilling`, or `task`) is optional and should be used only if present.
  Once claimed, assign it to the driving developer.
- **Blocking**: use native issue dependencies as described above.
- **Frontier query**: list the map's open children, omit any with an open blocker or assignee, and choose the first remaining child in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`.
- **Resolve**: comment with the answer, close the issue, then append a context pointer (gist and link) to the map's Decisions-so-far.
