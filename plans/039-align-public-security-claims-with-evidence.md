# Plan 039: Align Public Security Claims with Maintained Evidence

> **Executor instructions:** Replace claims that exceed the implemented or
> published security contract. Every retained operational claim must point to a
> maintained policy, control owner, or verifiable implementation scope.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/app/'[locale]'/'(marketing)'/security apps/web/messages/en.json apps/web/messages/vi.json SECURITY.md`
> Stop on material security-policy, bounty, or encryption-model drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** active `20260721-marketing-shell-redesign.md` ownership of
  the required `apps/web/messages/{en,vi}.json` paths
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Docs / Trust / Security claims
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The public security page calls server-decryptable at-rest encryption
"end-to-end" and promises researcher rewards that the published responsible
disclosure policy does not offer. Unsupported security claims create customer,
procurement, and legal risk on the page intended to establish trust.

## Current state

- `security/components/defence-grid.tsx:32-36` labels encryption in transit and
  at rest as `End-to-end encryption`.
- `packages/utils/src/encryption/encryption-service.ts:1-10` documents the
  implemented Calendar scope: AES-256-GCM at rest, with workspace keys
  recoverable using a server-held environment master key.
- `defence-grid.tsx:82-85` advertises an open bug-bounty programme that rewards
  researchers.
- `SECURITY.md:11-25` publishes responsible-disclosure, safe-harbor, updates,
  and optional credit, but no funded reward commitment.
- The same grid also asserts regular penetration testing, universal MFA, key
  rotation, and global-regulation compliance. These must be evidenced or
  softened during the same review rather than assumed true.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`, and
`$tuturuuu-agent-coordination`. Obtain evidence from repository policy/runbooks
only; if a claim depends on private operational evidence, STOP and ask the
named human control owner to approve exact wording.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused test | `bun --cwd apps/web vitest run 'src/app/[locale]/(marketing)/security/components/defence-grid.test.tsx'` | unsupported-claim assertions pass |
| Translation sort | `bun i18n:sort` | exit 0; message files sorted |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Marketing security-page control copy and links
- `security/components/defence-grid.test.tsx` (create) for high-risk claim assertions
- English and Vietnamese Web message bundles for any strings moved out of
  hardcoded JSX
- `SECURITY.md` only if a link/wording inconsistency must be corrected without
  inventing a new programme

Do not announce certifications, compliance, audit cadence, key rotation,
coverage guarantees, or financial rewards without maintained evidence and an
identified owner.

## Git workflow

- Branch: `docs/evidence-backed-security-claims` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `docs(security): align public claims with policy`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Build a claim-to-evidence matrix

Inventory every claim on the security landing, policy, and bug-bounty pages in
a review checklist inside `security/components/defence-grid.test.tsx`. For each
retained claim, record the repository policy/runbook/implementation scope in a
test-case comment or fixture name. Classify unsupported claims for removal or
narrower wording; absence of evidence is not permission to preserve a claim.

### Step 2: Correct encryption and disclosure language

Describe transport encryption and the actual scoped server-side at-rest
encryption without using end-to-end terminology. Rename the bounty claim to
responsible disclosure and describe only safe harbor, response expectations,
and optional credit already published in `SECURITY.md`.

### Step 3: Ratchet future copy

Move edited user-facing strings into both locale bundles. Add direct links to
the maintained policy where the design permits, and leave a concise source
comment or focused test mapping high-risk claims to their evidence owner so
future copy cannot silently reintroduce unsupported guarantees.

## Test plan

- Add a focused static/component assertion under the security page proving the
  rendered copy contains neither `end-to-end encryption` nor a reward promise
  unless an approved policy explicitly supports them.
- Verify English and Vietnamese key parity and link targets through `bun check`.
- Manually inspect the rendered page only if the executor has an approved local
  browser workflow; absence of browser access does not waive build/type gates.

## Done criteria

- [ ] Every retained public security claim has a maintained evidence source;
      unsupported claims are removed or narrowed.
- [ ] Encryption wording matches the actual server-decryptable implementation.
- [ ] Researcher wording matches the published responsible-disclosure policy.
- [ ] Both locales, tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if the team asserts a paid bounty, audit cadence, certification, universal
MFA, or rotation schedule that is not documented in an approved source. Report
the exact claim and missing owner/evidence rather than choosing legal copy.

## Maintenance notes

Security marketing is a controlled operational surface. Review it whenever the
underlying policy, encryption scope, or disclosure programme changes.
