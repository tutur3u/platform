---
name: tuturuuu-validation-offload
description: "Run heavy Tuturuuu validation on an authorized devbox when local execution is unsuitable."
---

# Tuturuuu Validation Offload

## Core Workflow

Use this skill when validation work is heavy enough to distract from coding or
when the user asks to test through devboxes. The goal is to keep local reasoning
fast while still collecting trustworthy command evidence.

Read `references/offload-playbook.md` when choosing command boundaries,
timeouts, sequencing, or failure triage for devbox validation.

## Decision Rules

Prefer devbox offload for:

- `bun check` and other repo-wide validation
- package test suites that run for more than a short focused pass
- Docker, Supabase, or browser workflows that consume a lot of local resources
- repeated validation while implementation continues locally

Keep validation local when:

- the command must inspect a live local browser window or desktop UI
- the target depends on unsynced local-only state
- the run would mutate production or global machine state without explicit user
  approval
- the user asked for native/local reproduction specifically

## Local Resource Admission

When validation stays local, use `$tuturuuu-cli-resources` and
`ttr resources run -- <command>` to share one validation slot across projects
and worktrees. Check status first. Same-machine devboxes and CI runners still
consume local CPU/RAM; identify the host before calling a run offloaded.

## Execution Pattern

Verify an unfamiliar runner with a small smoke command. Choose focused tests
for changed behavior and the repository-required checks; add package-wide tests
only when affected scope or an unresolved failure warrants them. Do not run
every validation tier merely because it appears in this guide.

Split independent commands into separate runs so failures identify the owning
surface. Use explicit `--timeout` values and report run IDs, status, exit code,
and key log lines.

## Failure Handling

Treat devbox-only failures as signal. Compare against a native focused run when
the root cause is unclear, then inspect:

- cwd and checkout resolution
- config env var names, especially `TUTURUUU_CONFIG`
- inherited environment and secret leakage
- shell startup output that pollutes logs
- missing local services or mismatched Supabase targets
- runner version drift, fixed with `ttr box upgrade` only when requested

Do not hide a devbox-only failure just because a native command passes. Either
fix the runner path or document the remaining devbox limitation.

## Handoff

Final reports should distinguish:

- native validation
- devbox validation
- same-machine brokered execution
- container-isolated or remote-machine execution

Include cleanup status for temporary runners. Do not include token values,
secret env values, or raw config files.
