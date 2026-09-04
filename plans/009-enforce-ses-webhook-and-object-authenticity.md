# Plan 009: Enforce SES Webhook and Inbound Object Authenticity

> **Executor instructions:** Remove the runtime signature bypass and constrain
> every SES object read to the configured inbound bucket/prefix. Run every gate
> before moving on. Do not log envelope signatures, raw mail, credentials, or
> object contents. Stop rather than weakening verification for local fixtures.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/mail/src/app/api/v1/webhooks/mail/ses apps/mail/src/lib/mail/inbound/sns.ts apps/mail/src/lib/mail/inbound/sns.test.ts apps/mail/src/lib/mail/inbound/ingest.ts apps/mail/src/lib/mail/inbound/ingest.test.ts apps/mail/.env.example apps/docs/platform/applications/mail.mdx`
> Any change to signature, topic, or S3-object validation is a STOP until this
> plan is reconciled with the live code.

## Status

- **Execution status:** BLOCKED — `apps/mail/**` and the Mail operations doc are
  owned by `tmp/agent-coordination/20260711-134432-codex-mail-catchall-ux.md`
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Depends on:** none
- **Category:** security
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The SES webhook accepts every parsed SNS envelope when one environment toggle
equals `disabled`, with no production/local guard and even when the expected
topic is absent. The authenticated result then permits notification-controlled
S3 bucket/key values to be read with the Mail server's AWS identity and ingested
through an admin database client. A deployment misconfiguration can therefore
turn a documented local-fixture shortcut into a network-reachable mail and cloud
data boundary bypass.

## Current state

`apps/mail/src/lib/mail/inbound/sns.ts:87-99` authenticates in this order:

```ts
const expectedTopicArn = getConfiguredTopicArn();
if (expectedTopicArn && envelope.TopicArn !== expectedTopicArn) return false;

if (process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION === 'disabled') {
  return true;
}

if (!expectedTopicArn) return false;
```

`apps/mail/src/lib/mail/inbound/ingest.ts:33-42` trusts the notification first:

```ts
const action = notification.receipt?.action;
const bucket = action?.bucketName ?? process.env.MAIL_SES_INBOUND_BUCKET;
const key = action?.objectKey ?? /* configured prefix + message id */;
```

The route calls `verifySnsEnvelope` before `ingestSesNotification`, but treats a
`true` result as complete authenticity. Docs at
`apps/docs/platform/applications/mail.mdx:51` describe the bypass as local-only;
runtime does not enforce that claim. Existing `sns.test.ts` already creates a
real synthetic RSA signature and stubs the trusted SNS certificate fetch, so
fixtures do not need a production runtime bypass.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Inbound unit tests | `bun --cwd apps/mail vitest run src/lib/mail/inbound/sns.test.ts src/lib/mail/inbound/ingest.test.ts` | exit 0; authenticity and object-boundary cases pass |
| Route tests | `bun --cwd apps/mail vitest run src/app/api/v1/webhooks/mail/ses/route.test.ts` | exit 0; unauthenticated envelopes never call ingestion |
| Mail typecheck | `bun type-check:mail` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Mail build | `bun run --cwd apps/mail build` | exit 0; Next compiles the changed route |
| Whitespace | `git diff --check` | exit 0, no output |

## Scope

**In scope:**

- `apps/mail/src/lib/mail/inbound/sns.ts`
- `apps/mail/src/lib/mail/inbound/sns.test.ts`
- `apps/mail/src/lib/mail/inbound/ingest.ts`
- `apps/mail/src/lib/mail/inbound/ingest.test.ts`
- New `apps/mail/src/app/api/v1/webhooks/mail/ses/route.test.ts`
- `apps/mail/.env.example`
- `apps/docs/platform/applications/mail.mdx`

**Out of scope:** Cloudflare ingestion, DNS/MX, AWS resource creation, mailbox
routing policy, thread counters, attachment storage, and production secret
changes. Do not add a replacement bypass keyed only by `NODE_ENV`, hostname, or
another environment variable.

## Git workflow

- Branch: `fix/mail-ses-webhook-authenticity` in an isolated worktree if the
  shared checkout is dirty or overlapping.
- Conventional Commit: `fix(mail): enforce SES webhook authenticity`.
- Do not push/open a PR unless instructed. Claim the Git commit window before
  staging/committing; never stage coordination notes.

## Steps

### Step 1: Remove the runtime signature bypass

Delete the `MAIL_SES_SNS_SIGNATURE_VERIFICATION === 'disabled'` success path.
Require a nonempty configured topic, exact `TopicArn` equality, a trusted
region-derived SNS certificate URL, and valid RSA signature in every runtime
mode. Keep the existing certificate URL restrictions and redirect refusal.

**Verify:**
`bun --cwd apps/mail vitest run src/lib/mail/inbound/sns.test.ts` → exit 0;
tests prove missing topic, mismatched topic, the old `disabled` value, untrusted
certificate URL, and invalid signature all return false, while the synthetic
valid signature returns true.

### Step 2: Constrain the S3 object to configured ingress

Make SES ingestion require `MAIL_SES_INBOUND_BUCKET`. If the signed notification
contains `bucketName`, require exact equality with that configured bucket. Use
the configured bucket for `GetObjectCommand`, never the notification value.
When `MAIL_SES_INBOUND_KEY_PREFIX` is nonempty, require the selected object key
to start with that exact prefix. Reject missing keys, foreign buckets, and keys
outside the prefix before creating/upserting an inbound job or constructing an
S3 client. Preserve the valid notification key and the existing message-ID
fallback within the configured prefix.

**Verify:**
`bun --cwd apps/mail vitest run src/lib/mail/inbound/ingest.test.ts` → exit 0;
tests cover configured bucket/key success, foreign bucket rejection, prefix
escape rejection, missing configured bucket, and message-ID fallback. Negative
cases make zero S3/admin persistence calls.

### Step 3: Prove route-level fail-closed ordering

Add the route test using hoisted mocks for `parseSnsEnvelope`,
`verifySnsEnvelope`, `ingestSesNotification`, and `logSesInboundError`. Cover
invalid signature (401), verifier exception (sanitized 500), and valid signature
delegation. Assert invalid/throwing verification never calls ingestion.

**Verify:**
`bun --cwd apps/mail vitest run src/app/api/v1/webhooks/mail/ses/route.test.ts`
→ exit 0; all three ordering cases pass.

### Step 4: Align configuration and operations docs

Remove the local-bypass instruction. Document the required topic and bucket,
optional exact key prefix, fail-closed startup/runtime behavior, and using
synthetically signed fixtures in tests. Add comments to `.env.example` without
values or credentials; do not add the removed toggle.

**Verify:**
`rg -n "MAIL_SES_SNS_SIGNATURE_VERIFICATION|disabled" apps/mail/.env.example apps/docs/platform/applications/mail.mdx apps/mail/src/lib/mail/inbound`
→ no runtime/docs bypass matches; test descriptions may mention the retired
setting only to prove it has no effect.

### Step 5: Run final gates

Run all commands in the table, ending with `git diff --check`.

**Verify:** all commands exit 0; `git diff --check` prints nothing.

## Test plan

Extend the existing cryptographic test pattern in `sns.test.ts:14-100`; never use
a live certificate or topic. Extend `ingest.test.ts` with injected/stubbed admin
and S3 boundaries. Add the route test for orchestration ordering. All fixtures
must use synthetic domains, ARNs, buckets, keys, and message contents.

## Done criteria

- [ ] No environment value can bypass SNS topic/certificate/signature checks.
- [ ] Missing expected topic or configured inbound bucket fails closed.
- [ ] S3 reads use only the configured bucket and optional configured prefix.
- [ ] Unauthenticated/invalid envelopes cannot call ingestion, admin persistence,
  or S3.
- [ ] Focused tests, Mail typecheck, `bun check`, the Mail build, and
  `git diff --check` pass.
- [ ] `git status --short` contains only the seven allowed implementation paths
  plus the plan index status update.

## STOP conditions

Stop if SES legitimately publishes through multiple topics/buckets, the active
AWS receipt rule does not supply a key under the configured prefix, a required
test needs live AWS access, or another non-terminal coordination note claims an
in-scope path. Amend the configuration contract explicitly; do not restore a
runtime authenticity bypass.

## Maintenance notes

Future inbound transports must authenticate their envelope before parsing
notification-controlled storage locations or creating admin clients. Reviewers
should scrutinize negative-call assertions and ensure the configured bucket—not
the signed payload—is passed to AWS. Atomic thread counters are a separate
deferred correctness plan.
