# Plan 334: Retire the Nonfunctional Playground Tool-Calling Demo

> **Executor instructions:** Remove the advertised Tool Calling page, its
> always-empty API route, and its navigation entry together. Preserve every
> other Playground experiment and do not replace this with live provider work.
>
> **Drift check (run first):**
> `git diff --stat f8fa36af4b..HEAD -- apps/playground/src/app/layout.tsx apps/playground/src/app/tool-calling apps/playground/src/app/api/ai/tool-calling apps/playground/src/app/playground-surface.test.ts apps/playground/package.json`
> Stop if a real tool-calling implementation, caller, or active exact-path owner appears.

## Status

- **Execution status:** TODO — no active exact-path owner
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** correctness / tech-debt / tests
- **Depends on:** none
- **Planned at:** commit `f8fa36af4b`, 2026-08-12

## Why this matters

Playground advertises Tool Calling as a first-class experiment, but its API
always returns `{}` while the page expects `text` and `steps`, yielding a blank
successful-looking screen. There is no test and no provider/tool behavior to
preserve. A dead demo is more misleading than an absent one, so retire the
entire surface until a separately designed, metered example exists.

## Current state and exact contract

- `apps/playground/src/app/layout.tsx:47-53` renders the `/tool-calling` link and
  describes tool calling in page metadata.
- `apps/playground/src/app/api/ai/tool-calling/route.ts:1-5` always returns `{}`.
- `apps/playground/src/app/tool-calling/page.tsx:5-33` fetches that route in
  `useEffect`, expects `{ text, steps }`, and renders empty values. It also
  violates the repository's client-data-fetching convention.
- Repository search finds no other `/tool-calling` caller and no Playground
  test suite. The app is an internal, non-indexable integration lab.
- Remove the route, page, navigation link, and metadata claims. Do not redirect
  the retired path or add a placeholder; ordinary 404 is the truthful contract.
- Keep object generation and every shared AI authentication/metering/provider
  surface unchanged. The blocked external-AI policy lane owns adjacent policy.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -ni -e 'tool-calling' -e 'tool calling' apps/playground --glob '!**/.next/**' --glob '!**/.turbo/**'` | before change, only the three named files; after change, only intentional negative test text |
| Focused test | `bun test apps/playground/src/app/playground-surface.test.ts` | retirement source contract passes |
| Deletion | `test ! -e apps/playground/src/app/tool-calling && test ! -e apps/playground/src/app/api/ai/tool-calling` | exits 0 |
| Typecheck | `bun --cwd apps/playground run type-check` | exits 0 |
| Build | `bun --cwd apps/playground run build` | production build passes and no retired route is emitted |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only layout, the two deleted route trees, focused test, and plan status changed |

## Suggested executor toolkit

- Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`.
- Use a small Bun source-contract test with `node:fs`; do not install a test
  framework or make provider/network calls.

## Scope

**In scope:** edit `apps/playground/src/app/layout.tsx`; delete
`apps/playground/src/app/tool-calling/page.tsx` and
`apps/playground/src/app/api/ai/tool-calling/route.ts`; create
`apps/playground/src/app/playground-surface.test.ts`; plan status.

**Out of scope:** implementing tool calling; redirects/placeholders; live AI
provider calls; AI credentials, metering, object generation, shared packages;
dependency changes/`bun.lock`; other Playground routes; navigation redesign.

## Git workflow

- Use branch `fix/retire-playground-tool-calling` in an isolated worktree and
  run `bun setup` immediately.
- Commit: `fix(playground): retire broken tool calling demo`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Freeze the retirement boundary

Create the focused Bun test. It must assert the layout contains no tool-calling
href/label/metadata keyword, both route/page paths are absent after the change,
and unrelated Home navigation plus the Playground heading remain. Scan the app
for the old API/path strings so another hidden caller cannot survive.

**Verify:** Focused test fails against the current three-file surface.

### Step 2: Remove the false product surface

Delete the page and API route. Remove only the Tool Calling link and the
tool-calling metadata description/keyword from the root layout; keep fonts,
providers, Home link, title, and other metadata unchanged. Do not add a redirect
or unsupported replacement response.

**Verify:** Caller inventory, Focused test, and Deletion pass.

### Step 3: Run application and repository gates

Run Playground typecheck/build, `bun check`, scope, and whitespace. Inspect the
build route list to confirm neither retired path is emitted and all other
Playground routes still compile.

## Test plan

- Source contract proves route/page absence, no nav or metadata promise, and
  preservation of Home/Playground shell.
- Repository scan proves no hidden caller or duplicate tool-calling surface.
- Typecheck/build prove route deletion does not break the app.

## Done criteria

- [ ] Playground no longer advertises or serves the nonfunctional demo/API.
- [ ] `/tool-calling` and `/api/ai/tool-calling` truthfully resolve through normal absence/404 behavior.
- [ ] No live provider, credential, metering, dependency, or adjacent AI surface changed.
- [ ] Focused test, typecheck/build, `bun check`, scope, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if any supported caller or real implementation appears; an external owner
depends on the route; deletion requires shared AI/auth changes; a redirect is
required by documented compatibility; or a required gate fails twice.

## Maintenance notes

A future demo should be a new design with explicit tool schemas, bounded input,
auth/metering policy, deterministic tests, and no client `useEffect` fetch.
