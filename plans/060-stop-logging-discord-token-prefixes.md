# Plan 060: Stop Logging Discord Token Prefixes

> **Executor instructions:** Remove every credential-derived Discord bot-token
> diagnostic, prove logs contain only configuration state, and hand the exposed
> credential type to an operator for rotation without printing its value.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/discord/app.py apps/discord/tests .github/workflows/discord-python-ci.yml`
> Stop if token diagnostics or the Discord test workflow changed.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `510c4c9dff4c9f0a7c916f27fcbbfce936087f3a`
  on branch `fix/discord-token-log-safety`; reviewer reran 5 focused tests, 51
  full tests, Ruff lint/format, mypy, and whitespace successfully
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Credential hygiene
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Two operational functions print the first ten characters of the live Discord
bot token. Those characters are retained by deployment and log-export systems,
reduce the credential's secrecy, and make rotation necessary even after the
logging code is removed.

## Current state

- `apps/discord/app.py:662-674` loads `DISCORD_BOT_TOKEN` for the token test and
  prints a ten-character prefix.
- `apps/discord/app.py:729-759` repeats the prefix diagnostic while reconciling
  slash commands.
- `.github/workflows/discord-python-ci.yml` defines the authoritative `uv`
  lint, format, mypy, and pytest gates for this Python workspace.
- Existing tests live under `apps/discord/tests/`; none asserts that operational
  output is independent of credential contents.

## Required skills and preflight

Load `$tuturuuu-agent-coordination`. Inspect active Discord ownership notes and
deployment runbooks. Never read or echo the real environment value; tests must
use an unmistakably synthetic sentinel.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused test | `cd apps/discord && uv run pytest tests/test_log_safety.py` | credential sentinel never appears |
| Full tests | `cd apps/discord && uv run pytest` | all tests pass |
| Lint | `cd apps/discord && uv run ruff check .` | exit 0 |
| Format check | `cd apps/discord && uv run ruff format --check .` | exit 0 |
| Typecheck | `cd apps/discord && uv run mypy . --config-file mypy.ini` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/discord/app.py`
- New `apps/discord/tests/test_log_safety.py`
- Operator handoff naming only the `DISCORD_BOT_TOKEN` credential type and the
  need to rotate it; never include the credential or prefix

Do not change Discord command behavior, HTTP request/response logging, Modal
secret configuration, command definitions, dependencies, or workflow files.

## Git workflow

- Branch: `fix/discord-token-log-safety` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(discord): stop logging token prefixes`.
- Do not push/open a PR or rotate a deployment secret unless instructed. Claim
  the commit window before staging.

## Steps

### Step 1: Remove credential-derived diagnostics

Delete both prefix prints. A diagnostic may say only whether the token is
configured; it must not include length, prefix, suffix, hash, encoding, or any
other value-derived fingerprint. Preserve useful client-ID and response-status
diagnostics that contain no credential material.

### Step 2: Add a log-safety regression

Create a focused source/behavior test following the existing pytest style. Use
a synthetic token sentinel and exercise or statically inspect both operational
functions so the test fails if any substring, slice, or representation of the
token is formatted into logs. Do not make live Discord requests.

### Step 3: Record the rotation handoff

Report that prior logs may retain a Discord bot-token prefix and that an
authorized operator must rotate `DISCORD_BOT_TOKEN`, update the deployment
secret, and restart/redeploy the bot. Do not claim rotation without operator or
provider evidence.

## Test plan

The focused test must cover `test_bot_token` and `create_slash_command`, a
configured synthetic token, an absent token, and a source-level guard against
future token slicing in log calls. Full pytest, Ruff, formatter, and mypy remain
the CI parity gates.

## Done criteria

- [ ] No log statement derives output from the Discord bot token.
- [ ] The focused regression fails on the old prefix pattern and passes now.
- [ ] Discord tests, lint, format check, typecheck, and whitespace pass.
- [ ] The final handoff explicitly marks credential rotation as completed or
      still operator-required, with no secret material reproduced.

## STOP conditions

Stop if another active lane owns `apps/discord/app.py`, if a deployment tool
requires token-derived output for an undocumented protocol, or if rotation
would require changing external state without operator authorization.

## Maintenance notes

Operational credential checks should log only configured/not-configured state.
Redaction is not a license to retain prefixes, suffixes, hashes, or lengths.
