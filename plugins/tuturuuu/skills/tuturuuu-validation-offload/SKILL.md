---
name: tuturuuu-validation-offload
description: Tuturuuu validation offload guidance. Use when deciding whether to run tests, `bun check`, Supabase setup, Docker-heavy workflows, Playwright suites, or other long validation commands through internal devboxes instead of consuming the local agent session.
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

## Execution Pattern

Start with focused commands, then broaden:

1. Quick runner smoke such as `bun --version`.
2. Focused tests for the changed files.
3. Package-level tests.
4. `bun check` only after narrower failures are resolved.

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
