# Git guard on fleet machines

Fleet machines publish `tutur3u/platform` and `upskii/platform` work directly to
`main`. They do not open pull requests or push new remote branches.
`ttr git guard` enforces this per machine. Full behaviour:
`apps/docs/build/development-tools/git-guard.mdx`.

- Check a machine with `ttr git guard status --json` before relying on it. The
  hook must be current with the global hooksPath active, the gh guard must be
  active, and every working clone must show `guarded: true`.
- A refusal is the expected outcome. Do not retry with `--no-verify`, a renamed
  branch, `gh api`, or an MCP tool. Use the direct-to-main flow named in the
  message.
- A real exception needs `ttr git guard allow-once` with `--reason` and
  `--approved-by`, created only after the approver says so. It is logged and
  single use. Never create one for a lane's convenience.
- Rollout proof uses a throwaway `guard-probe/<machine>` push and a
  `gh pr create` that are both refused locally. Never create a real remote
  branch or PR to prove the guard.
- A clone that `status` reports as bypassing the guard is fixed with
  `ttr git guard install --repo <path>`, not by editing hooks by hand.
