# Fleet QA helper contract

Provider execution requires independent exact-source and one-use execution
approval. Public production project `nzamlzqfdwaaxdefwraj` is source-pinned. Executor
custody is supplied by the approved launch packet through argv and must match
the external ACK; these bindings and reserved identifiers grant no authority.
The launcher stays unarmed until the executor qualifies its private layout and
receives the exact ACK content. Only Rex executes; never a source author or Linux.

## Entry points and aliases

Use the standalone `scripts/auth-ops/fleet-qa.mjs` as Node's `argv[1]` for
`--custody-directory <absolute-canonical-directory> <absolute-receipt-path>
execution` or `cleanup`. Every local receipt command also requires the explicit
`--custody-directory` option; there is no home-directory default. Both modes reject nonempty
`execArgv`, any `NODE_OPTIONS`, and a helper outside the verified custody copy.
The `packages/supabase/ops/fleet-qa.mjs` wrapper refuses both credential modes.
It supports only local `status`, `record-workspace a1 <uuid>`, and
`record-visit <a1|a2> <surface-label>` receipt operations.

Only `a1` (`qa-d241h-a1@tuturuuu.com`) and `a2`
(`qa-d241h-a2@tuturuuu.com`) are allowed. Neither account is adopted if it
already exists. There is no fleet admin account, role grant, password, invitation,
email send, auth configuration change or helper membership write. Creation uses
`email_confirm: true` and matching app/user metadata: `qa=d241`, the execution
ACK ID, run UUID and display name `QA D241h A1` or `QA D241h A2`.

Before creating either user, one service-role Auth GET per alias uses
`/auth/v1/admin/users?filter=<alias>&per_page=2&page=1`. Wildcards, backslashes,
whitespace and unapproved aliases are refused. Zero returned users means absent;
one requires exact lowercase email equality and a valid user ID. Two rows,
mismatches, malformed responses and HTTP errors stop without pagination or retry.
A pending `platform_email_roles` row also stops before creation. Every resulting
`platform_user_roles` row must be absent or contain only false privilege flags.

## Source binding and private custody

The credential path is in `fleet-qa.mjs`; its non-credential sibling
`fleet-qa-local.mjs` contains receipt, CLI and listener handling. The entry pins
and verifies the sibling's SHA256 before importing it. Before admission, only
builtins and that verified non-credential module are loaded. The executor must
place the reviewed entry, sibling, receipt schema and qualified SDK supplier in
a private 0700 layout with 0600 source files, outside the author's write path.
It hashes all reviewed local files before spawning and resolves imports only
inside that private layout. SDK layout qualification is separate evidence. Author/executor separation is
procedural under the same operating-system UID, rather than a kernel isolation
boundary. The launch packet must state and enforce that custody arrangement.

The entry computes its own byte hash; it never embeds its own hash. The external
ACK at `d241q-ack.json` inside the supplied custody directory has exactly these fields:
`ackId`, `helperSha256`, `moduleSha256`, `receiptSchemaSha256`, `projectRef`,
`custodyDirectory`, `executor`, `expiresAt`, `labels`, `oneUse`, `securityAck`,
and `reviewer`. `custodyDirectory` must exactly equal the canonical argv value.
`moduleSha256` contains only `fleet-qa-local.mjs`. All hashes and the requested
mode must match. The executor is `Rex`, reviewer is
`Security Desk (Selene, D269)`, both booleans are true and both labels are admitted.
Expiry must be a future ISO timestamp with `+07:00`, no later than the cleanup
deadline. No live JWT setting or invented expiry value is required by this ACK.

The ACK is opened `O_NOFOLLOW`: a regular single-link 0600 file owned by the
executor UID in its 0700 directory. Receipt paths stay inside custody, with
owner-only directory ancestors within that boundary and no symlinks. The helper
takes the receipt lock and reserves or validates the receipt before consuming
an `O_EXCL` intent named by ACK ID. Existing intent means STOP. Only then may it
read process environment or resolve the SDK. Only Security supplies real ACK
content; the orchestrator places those bytes verbatim through executor custody.

The executor supplies only `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_SUPABASE_URL`
through an explicit process-environment allowlist. The pre-spawn packet must
exclude `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`, all proxy variables,
`NODE_USE_ENV_PROXY`, `NODE_PATH` and `NODE_OPTIONS`; do not inherit the executor's
shell environment. The URL must equal the pinned project origin. Every
HTTP call checks ACK expiry and deadline, refuses another origin, userinfo,
fragment or redirect, and has a 15-second timeout. Neither credentials nor
supplier bodies are printed, persisted, passed in argv or put in receipts.

## Execution and browser consumer

`D241Q-EXECUTION-01` admits one invocation: create both users, then at most one
fresh `generateLink(type:magiclink)` per label. No email is sent. Returned user
identity, metadata, HTTPS project origin, `/auth/v1/verify`, magiclink type and
exact `https://tuturuuu.com/login` redirect must match. Links remain in memory.
There is no separate login command or re-mint after an unused or expired link.

Each one-shot listener binds a random 127.0.0.1 port, with a TTL at most five
minutes. The first request consumes it. Only `GET /`, exact Host, no Origin,
Cookie or Authorization, browser navigation Fetch Metadata and no Purpose or
Sec-Purpose prefetch receive a 302. Responses have no cookie, no-store caching
and no-referrer policy. Malformed, rejected, expired and stopped listeners discard
the link. Signal handlers close listeners, record their outcome and release the
receipt lock; they do not remove the consumed intent or authorize a retry.

Output is labels, ports, IDs and outcomes only. The approved browser consumer
on Rex's host navigates once to `http://127.0.0.1:<port>/`. It must not probe,
fetch, inspect response headers, capture or print the action URL, place the URL
in tool arguments or a file, use an `open <action-link>` command, or forward
ports. Readiness and a consumed listener do not prove signed-in identity. The
custodian must qualify the actual browser/session before any live QA claim.

Every visited surface is recorded with `record-visit`. Allowed label forms are
`web:<action>` and `app:<app>:<action>`, where action is login, logout,
account-switch, dashboard or qa-workspace-create. The signed-in QA browser must
not visit shortened-links, time-tracking export, Aurora or crawler surfaces.
Recording labels does not independently enforce browser navigation or authorize
other tests. No USER browser session is a fallback.

## Workspaces, receipt and cleanup

The 0600 receipt has a strict schema: labels, IDs, timestamps, role/residual
counts, login outcomes and visited surface labels, with no email, links, tokens,
supplier errors or secrets. `accessTokenLifetime` is `UNKNOWN`; the helper never
reads auth configuration. Synced temporary files and atomic rename compare the
observed receipt bytes before saving, refusing concurrent changes. Partial and
unknown outcomes retain their receipt and intent for reviewed reconciliation.

Both personal workspaces are recorded by the helper at creation and retained
through QA. A1 creates one shared `QA D241` workspace through the normal product
UI afterwards; Bea records its ID in `sharedRecords`. That record is data,
not authority. A2 may have no shared workspace membership.

Before cleanup, the QA browser signs out. The execution packet must qualify the
supplier's actual `getUserById` 404 shape. It must also either verify the profile
and tombstone predicates before deleting Auth, or explicitly accept the residual
risk of a post-delete predicate failure with a reconciliation plan; source
approval alone does not accept that execution risk. `D241Q-CLEANUP-01` admits one invocation
and preflights both owned identities and the complete workspace/member inventory
before any deletion. A failed login remains cleanup-eligible only if identity,
metadata and workspace ownership still verify. Any unrecorded row, foreign
member, group mismatch or unverifiable ownership stops cleanup.

For each account, the helper uses this order:

1. Delete A1's recorded shared workspace only after checking ID, A1 creator,
   `personal=false`, creation at or after execution start and a name containing
   `QA D241`. DELETE uses both ID and creator ID, followed by a per-row readback.
2. Delete the Auth user. This cascades session revocation; no login link, OTP
   verification or mint-to-revoke operation runs during cleanup.
3. Require `getUserById` to return actual `user_not_found` 404 and the same
   single filtered alias GET to return zero users.
4. Read back each recorded personal workspace. If the cascade removed it,
   accept absence. Otherwise require recorded ID, creator ID and `personal=true`,
   with no members, then delete once using both ID and creator ID and read back.
5. Require no memberships or recorded workspaces. Enumerate alias-only `users`,
   `user_private_details` and all-false `platform_user_roles` tombstones by count.
   They are retained; unexpected personal data refuses successful completion.

A preexisting access JWT can remain valid until its expiry; its lifetime is
UNKNOWN. Cleanup's absence evidence is the Auth readback plus exact alias lookup,
not a replay of a single-use token. The cleanup deadline is 17 November 2026,
23:59 ICT. Expired authority or an unknown operation stops without retry.

## Verification boundary

Node tests use synthetic project/credential values, temporary private copies,
mock trigger behavior and disposable loopback listeners. Tests cover both
personal-workspace cascade outcomes, the creator-present deletion guard, exact
cleanup filters/order, alias lookup anomalies, role checks, guarded HTTP, receipt
conflicts, signals, null pins and real on-disk intent replay. Mutation controls
must catch group/type/creator/time/name/filter/order regressions. Run focused tests
single-worker under admitted host resources; syntax, Oxc, the committed changed
gate and exact-diff gitleaks complement them. No mock establishes real supplier
layout, production revocation, signed-in acceptance or cleanup. Those require
exact review, executor custody and actual receipts.
