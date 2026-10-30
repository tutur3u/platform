# Database And API Patterns

Load this reference for Supabase, protected-table, storage, migration, or
workspace-scoped API work.

## Declarative adoption preparation

For declarative readiness, baseline qualification, diff-engine distinctions, and
imperative exceptions, read `declarative-schema-adoption.md`. Run the read-only
`node apps/database/scripts/declarative-schema-readiness.js --json`; exit 2
means adoption is held. Do not add partial schema trees or change the engine
until complete disposable replay, ledger coverage, no-op diff, and independent
review prove baseline equivalence. Existing migration history stays immutable.

## Schema And Typegen

- Remote `db reset --linked` retains managed storage tables. Bucket creation
  defaults must tolerate existing IDs; preserve intentional configuration upserts.
  See [storage replay verification](../../../../../apps/docs/build/development-tools/local-supabase-development.mdx#replaying-migrations-with-existing-storage-buckets).
- Prepare migrations; do not push production Supabase changes from Codex.
- Prefer additive migrations and runtime fallbacks when rollout order can vary.
- Separate short existing-table DDL, `VALIDATE CONSTRAINT`, and concurrent index
  creation into distinct migration transactions. Earlier `ALTER TABLE` locks
  otherwise survive through later scans; `lock_timeout` bounds acquisition, not
  lock lifetime. With pinned CLI 2.117.0, keep `CREATE INDEX CONCURRENTLY` as the
  only statement in its file so it executes outside the transaction batch. See
  the [habit migration sequence](../../../../../apps/docs/platform/features/mira-health-planning-tools.mdx#idempotent-writes)
  for the schema-preserving split and regression coverage.
- A failed concurrent index build can leave an invalid index that `IF NOT EXISTS`
  silently skips. Add a following catalog guard that raises on a missing or
  invalid required index. Do not conditionally drop concurrently inside `DO`
  (unsupported), or unconditionally drop a healthy index in a preceding retry.
  Recovery: inspect `pg_index`, find and resolve conflicting duplicate keys
  without deleting history, then run `DROP INDEX CONCURRENTLY` on the invalid
  index outside a transaction and retry the authorized migration workflow. If
  the create migration was already recorded, rebuild with its exact standalone
  concurrent-create statement before retrying the guard; never bypass the guard
  by editing its ledger entry. See the
  [creation-key recovery runbook](../../../../../apps/docs/platform/features/mira-health-planning-tools.mdx#recover-a-failed-concurrent-creation-key-index)
  for SQL, missing-index handling and release authority.
- Apply local migrations before `bun sb:typegen` when possible. Typegen reads
  the live local schema, not unapplied SQL.
- Never hand-edit generated type files. Prefer shared DB row aliases from
  `@tuturuuu/types/db`.
- CLI image upgrades can change generated declarations without an application
  migration. Regenerate `public,private,storage` from a complete disposable replay
  and compare old/new generators against the same database to separate generator
  changes from service-supplied schema changes. Keep AST drift checks insensitive
  to equivalent quoted property names while retaining optionality, nullability,
  computed-field and relationship checks. See
  [CLI upgrade type drift](../../../../../apps/docs/build/development-tools/local-supabase-development.mdx#cli-upgrade-type-drift).
- After generator upgrades, check all active workspace consumers, not only the
  first Turbo failure. Narrow object-only JSON producers at their source; retain
  nullable delivery contracts and complete computed-row fixtures. Cold no-emit
  source-resolution configs must preserve the owning workspace's exclusions;
  they do not replace exact-commit CI. See the CLI upgrade type drift guide above.
- If a migration adds or changes PostgREST-exposed RPC signatures, drop legacy
  overloads that would make named arguments ambiguous.
- Call typed `.rpc(name, args)` directly. Binding the full generic RPC method can
  trigger TS2589 as schemas grow; do not cast it to an untyped callable. Omit
  optional arguments only after verifying their SQL defaults preserve behavior.
- Public `SECURITY DEFINER` RPCs must enforce `auth.uid()` and workspace/RBAC
  checks internally, then revoke broad execution and grant only required roles.
- For resumable multi-phase RPCs, authorize every phase before any early success
  return. Treat permission results `IS DISTINCT FROM TRUE` as denial. Recreate
  replacements and manual rollbacks from the full-chain catalog definition and
  ACLs, including later private-schema moves; qualify relations before narrowing
  the path. Keep private-schema regression checks for explicit qualified access.
  Lock rows in a fixed order before a check-then-delete, and never let a manual
  rollback re-grant `PUBLIC` or `anon`. Definer helpers that take table or column
  identifiers stay `service_role`-only and raise outside an exact allowlist.
- Public functions created before `20260522172925` inherited EXECUTE for
  `PUBLIC`, `anon` and `authenticated`. When touching one, revoke from all three,
  grant only the roles its callers use, and check RLS policies and invoker
  functions that call it first (policies run as the querying role). Pin
  `search_path` with `ALTER FUNCTION ... SET`; never `SET LOCAL` inside a body,
  which leaks into the caller's transaction. Actor checks follow the
  `auth.role() IS DISTINCT FROM 'service_role'` idiom.
- Definer path trust comes from current schema privileges: `PUBLIC`, `anon` and
  `authenticated` must lack effective `CREATE`. Require explicit `pg_temp` last
  for every path; empty and catalog-only paths are unsafe for TEMP types too. Reject inherited paths,
  `$user`, nonexistent schemas and explicit `pg_temp_N`/`pg_toast_temp_N` names. Run `security-definer-search-paths.sql` across
  every configured exposed schema and retain its negative controls. Prefer ALTER
  to body replacement; check nested invoker dependencies before narrowing lookup
  to `pg_catalog, pg_temp`. Limit application DDL and assertions to ownable,
  non-provider functions; report other owners and managed schemas with the
  `security-definer-skip` marker. Unowned first-party functions in public/private
  require an explicit signature/owner/reason allowlist entry in the path contract
  (currently empty); provider ownership is not inferred from a role name.
  Verify final catalog policy dependencies, views, invoker functions, triggers,
  defaults and user-client RPC callers before revoking EXECUTE. Run
  `security-definer-policy-callers.sql` to enforce policy-role EXECUTE, including
  PUBLIC policies and its failing privilege control. See the RPC
  hardening section of `apps/docs/build/devops/secrets-and-configuration.mdx`.
- Catalog-wide anonymous EXECUTE changes must snapshot effective signed-in/service
  privileges before revocation and restore only previously available access.
  Preserve exact-signature anonymous exceptions for final policy/view and invoker
  dependencies. Function defaults need a global revoke as well as the schema
  revoke; schema ACLs cannot subtract the implicit global PUBLIC grant. Provider
  defaults require their owner. See the RPC hardening runbook and
  `20261027151200_anon-definer-execute.sql` for the catalog and privilege snapshot.
- Admin-only report RPCs can retain an internal workspace-permission guard without granting authenticated EXECUTE. Test ACLs first, then grant authenticated only inside the rolled-back pgTAP transaction to prove both denial and permitted-member behavior. Before removing an obsolete overload, inspect `pg_get_functiondef` and final SQL/trigger callers on a fresh full replay; historical callers may have been replaced. See the RPC hardening runbook and `anon-definer-migration-c.sql`.
- Audit definer revokes must name PUBLIC and both client roles explicitly. Re-verify app/package callers before denying schema USAGE; preserve service/owner access and each audit creator's schema-local defaults. Verify the migration as plain postgres, separately from provider-owned objects. Capture ACL grantors and grant options for exact rollback; schema-local function defaults cannot subtract a global authenticated grant, so verify effective schema access too. See `sb25-nonpublic-definers.sql` and the RPC hardening runbook.
- Views over RLS-protected tables need `security_invoker` before broad grants.

## Outbound SSO persistence

The phase 2 SSO tables deny direct browser and service-role access. Use the
service-only tenant-scoped RPCs after resolving the real actor; consent reads
bind `auth.uid()` internally. Preserve client-before-assignment/transaction lock
ordering and the unique request reservation. Consumption and audit/subject writes
must commit together. Validate changes with
`node apps/database/scripts/verify-sso-persistence.mjs` through resource admission:
it applies the full disposable schema, runs pgTAP plus an actual two-connection
replay race and membership/assignment revocation races in both commit orders,
generates types from that database and performs owned cleanup. Observe the
competitor blocked by the holder PID; a delay alone does not establish ordering.
Use direct assignment DML to keep the management RPC's client lock from masking
missing assignment locks. Confine lock-removal negative controls to the disposable
database. See
[SSO persistence](../../../../../apps/docs/platform/features/sso.mdx#phase-2-persistence-boundary)
for the database versus future Auth/MFA/signer boundary. Bind live user links to
`auth.users`, not the retained public user row. Membership deletion and demotion
must revoke assignments; workspace cleanup cascades operational state while
immutable audit/disclosure receipts keep denormalized correlation UUIDs without
parent FKs. Force RLS on all eight tables, test a non-BYPASSRLS owner, and verify
approved definer owners can still execute the RPCs. If the committed base types
lag the applied schema, reconcile a generated base/candidate delta automatically
and exclude unrelated baseline drift; never hand-edit generated declarations.

## Workspace-Scoped Writes

- Authenticate before normalizing workspace aliases when possible.
- If one route in a flow accepts workspace aliases, normalize consistently in
  every companion route.
- Verify workspace membership with the request-scoped client before
  admin-backed child-resource lookups.
- After membership is proven, keep validation reads, inserts, and relation-table
  writes on the same authorized admin path when protected tables require it.
- For workspace-scoped `UPDATE` or `DELETE`, request returning rows and stop
  side effects when no row matched.
- Membership lookup errors are `500`; successful lookups with no membership are
  `403`.
- Never filter by a credential value (`access_token`, `refresh_token`):
  PostgREST puts every filter in the request URL, where gateway logs keep it.
  Fence by row id and metadata such as `created_at`, compare a sha256
  fingerprint inside an RPC body (see `quarantine_calendar_auth_token`), or
  compare in process. `packages/utils/src/oauth-credential-url-filter.test.ts`
  scans every app and package source for this pattern.

## Storage

- Authenticated storage API routes should authorize with the user-scoped client,
  then perform storage operations through an admin-backed storage client.
- Supabase signed upload URLs for protected buckets often need admin-backed
  storage clients because `createSignedUploadUrl` writes storage metadata.
- Do not request signed read URLs before the client uploads the object.
- Storage key builders must sanitize parent paths and terminal names.
- The `workspaces` bucket RLS is path-scoped
  (`workspace_storage.object_access`). Pass
  `(select workspace_storage.actor_access())` so permissions resolve once per
  statement, not per row. Browsers never write private
  roots (`chat`, `chats`, `external-apps`, `AI Agent Imports`, `mira/images`,
  `recordings`, `.tuturuuu`). Issue signed upload URLs from the owning API
  after an ownership check. When you add a private root, update the helper,
  the Drive path policy and `tests/workspace-storage-least-privilege-rls.sql`
  together. See `apps/docs/build/devops/workspace-storage-rls.mdx`.
- Folder deletes should recurse through the Storage API; do not depend on
  direct `storage.objects` SQL scans.
- Mixed Supabase/R2 upload helpers must preserve Authorization headers when
  the server issued a bearer token and relax only headers that break presigned
  PUTs.
- Storage paths that mirror protected domain records must reuse that domain's
  request-scoped authorization model before any admin-backed list, metadata, or
  signed-read operation. Finance transaction attachments, for example, should
  call `get_wallet_transactions_with_permissions` with `p_transaction_ids`
  through the authenticated Supabase client so wallet whitelists, viewing
  windows, and granular income/expense visibility match normal transaction
  reads.
- Direct-to-storage signed uploads still need server-side upload policy. Require
  positive declared sizes before signing, enforce domain caps before issuing the
  URL, and validate the actual stored object during finalize. When a finalized
  object violates the policy, delete it before returning an error so understated
  signed-upload requests cannot retain oversized files.
- For quota-sensitive namespaces where finalize cannot reliably verify the
  stored object, such as user-group/course storage or external-project media
  assets, route multipart bytes through `apps/web` and upload with the measured
  server-side byte length instead of issuing a signed upload URL.

## Validation

- For internal profile save failures, resolve the actual route owner first:
  Infrastructure owns the legacy UUID PATCH; Web owns the employee subtree.
  Capture the existing failed HTTP status/message before inferring SQL failure.
  The profile service logs fixed failure stages and allowlisted codes without
  payloads. An update-stage `42501` can be a managed employee name fence, but
  requires read-only target/registry and installed-trigger evidence to attribute.
  Preserve that fence, uniqueness and quotas; do not broaden authorization or
  replay a mutation for diagnosis. See
  [profile failure diagnosis](../../../../../apps/docs/platform/applications/infrastructure.mdx#diagnose-an-internal-profile-save-failure).

- Use concrete table insert/update types for typed Supabase payloads instead of
  `Record<string, unknown>`.
- Narrow split-key or grouped identifiers before `.in(...)` calls and `Map`
  reads.
- For JSON columns, transform parsed Zod payloads into the repo `Json` shape so
  typed Supabase builders accept them.

- Full-schema SQL fixtures must account for trigger-created rows. Workspace
  insertion creates its creator membership through `add_ws_creator`; reuse and
  assert that membership rather than inserting it again in later scenarios.
  Keep an explicit assertion when membership is part of permission admission.

- Feedback schema qualification uses the maintained hosted employee schema
  workflow's default-off `include_feedback` test profile: foundation172 plus
  feedback106, with same-database type generation and owned cleanup. All profiles
  still apply the full tracked migration snapshot; the flag does not gate SQL
  application or activate the feature. Isolate old matrix children from inherited
  feedback dispatch flags while keeping feedback controls explicit. Keep the
  original eligibility BEFORE evidence. After its actual full-schema failure,
  a separately admitted eligibility fixture may suppress only the named personal
  workspace trigger around its two synthetic Auth inserts: require original normal
  enabled state, restore/verify it before all assertions, check it again before
  rollback and fail closed on any unexpected state. Keep the original30 behavioral assertions and correlation31;
  non-TAP integrity fences fail the packet without changing its count. This constructs
  an eligibility precondition, not canonical signup behavior. No membership deletion,
  broad trigger bypass or production alteration. Selector/static/parser checks are
  not SQL AFTER qualification. See
  `apps/docs/build/development-tools/employee-schema-qualification.mdx` for the
  exact input combination and staged BEFORE/AFTER boundary.

- Full-schema admission fixtures must assert membership in the target workspace.
  Auth bootstrap can independently create a personal workspace for a synthetic
  user; that membership does not admit them to another workspace.

- Use distinct PL/pgSQL variable names and qualified table columns in trigger
  permit lookups. A name shared by a variable and a column can raise SQLSTATE
  `42702` before the intended admission error. Retain pgTAP assertions for the
  rejected mutation's exact error and unchanged state.

## Bounded Mail admission fixtures

- The Mail PGlite/pgTAP fixture applies actual notification migrations with a
  synthetic schema, preference lookup and `pg_net` transport. Queue its runner
  through `ttr resources`; never report it as full Supabase or provider proof.
- Reconcile legacy receipts without alerts before claiming raw-event/user keys.
  Preserve suppressed decisions, nullable duplicate history and unknown delivery
  outcomes. Configured `mail_domains.verified_at` is not fresh DNS ownership.
- Require authorized full-chain migration/type generation and exact-commit CI
  before promotion; see
  [Mail notification evidence](../../../../../apps/docs/platform/applications/mail-inbound-notifications.mdx).

## Personal journal qualification

Use the existing disposable Linux schema workflow's `include_personal_journal`
profile for the full selected migration snapshot, 172 foundation plus 24 journal
rollback assertions and same-database private RPC type generation. Keep employee
journal/HTTP/RESTORE/address-migration profiles off for this selection. Require the exact-source
receipt, fixture/type digests and positive cleanup; provider, explicit consent and runtime
acceptance remain separate gates. See [schema qualification](../../../../../apps/docs/build/development-tools/employee-schema-qualification.mdx#personal-journal-schema-qualification).

Correct chronology only for a new, unapplied PR migration, preserving its SQL
bytes. Never rename an applied migration or reuse old-source SQL/type receipts
after a snapshot identity change; requalify the new exact source.

### Legacy address migration suppliers

The migration supplier uses a separate protected journal; do not reuse
CREATE/RESTORE receipts. Its PostgreSQL fixture runner verifies the new migration
against reduced prerequisites, not the full schema or GoTrue. GoTrue `identity_id`
is SQL `auth.identities.id`, while JSON `id` is provider-specific. Verify identity
email state independently: admin `{email}` can leave `email_verified=false` despite
a confirmed timestamp. Retain pending inspection; the email-v1 path never supplies
`email_confirm`.
Pinned GoTrue v2.197.0 admin confirmation and magic-link recovery do not set the
email identity flag. For a disposable positive fixture, create an unconfirmed
source and use supported signup link/OTP verification, which sets the matching
identity flag. Preserve the existing strict guard; never manually set identity
verification or infer it from the timestamp. This does not repair an already
confirmed production source. The real-provider runner compares sessions and
refresh tokens and simulates a lost PUT acknowledgement without replay; its mail
table and journal are fixtures, not full-schema proof. Add the separate 10-assertion
migration packet through the opt-in trusted-control schema selection; preserve
foundation172, journal301, HTTP29 and separately admitted RESTORE66 receipts.
See `apps/docs/build/development-tools/employee-address-migration.mdx` for the
canonical fingerprint, lock scope, mail prerequisites and remaining runtime gates.
The bounded Google-destination path is a separate contract: exactly one original
Google identity already verifies the exact canonical destination and stable
provider ID/subject. Its explicit mailbox preparation cannot adopt owned,
quarantined, archived, populated or shared rows, reset any operation, or mutate
Auth. Snapshot only after committed ownership readback. One admin
`{ email: destination, email_confirm: true }` update, backed only by the exact
verified Google destination claim, may add one verified email identity while
preserving the complete Google identity; retain distinct actual before/after hashes
and a durable transition receipt. Timestamp fallback or treating those hashes as equal is not
qualification. Its separate 30-case rollback packet and SQL-seeded real-GoTrue
mode do not replace full schema, external Google or hosted mailbox evidence.

## Employee RESTORE transport qualification

Extend the canonical employee schema/HTTP runner for RESTORE rather than creating
another database lifecycle. The optional RESTORE profile requires journal and HTTP
selection; preserve the 301 SQL and 29 CREATE checks and require its separate fixed
phase counts, real committed readbacks, zero child exit and owned cleanup. Inject
lost acknowledgements after real PostgREST/GoTrue completion and retain operation
and user UUIDs; reconciliation must never repeat the provider mutation. SQL ACL
checks and real Auth transport remain separate from Web/satellite session proof.
See [employee schema qualification](../../../../../apps/docs/build/development-tools/employee-schema-qualification.mdx).

## Inventory concurrency lock boundaries

The cascade fixture rejects every granted advisory lock except the proven
employee-admission bigint key in `ShareLock` mode with `objsubid=1`. Keep that
predicate narrow: unknown keys, an exclusive mode, real inventory keys, and the
same halves in the two-integer namespace must still fail. Explicitly account for
permitted locks rather than allowing a generic count of one.

The full-schema failure mapped shared employee admission through the profile FK
`SET DEFAULT` update and its statement-level admission trigger. Preserve that
admission. The 28-check Inventory fixture retains the original 22 cases and adds
rollback controls for a zero-row profile update, mixed admission/inventory locks,
unexpected key/mode/namespace, and cleanup. Require actual same-schema CI to run
these controls; source and mock checks cannot qualify the repair. Keep bounded
failure-only diagnostics, original tested counts and cleanup on failure.

## Address migration admission contention

Migration RPCs must try exclusive `employee-address-reservations` admission and
raise `55P03` on contention before row locks or durable state changes. A blocking
exclusive waiter can queue later shared Auth/profile/mail writers behind it.
Retain ordinary shared admission and every subsequent row/table NOWAIT fence.
The minimal qualification runner owns a three-session blocking-exclusive control
and four RPC contention cases with unrelated Auth-writer progress and unchanged
fixture snapshots. Its exact daemon check is a fixture admission fence, not a
portable Docker version requirement. Run only with a separately admitted disposable
lifecycle; the composed 10-SQL packet is not concurrency proof. Source checks are
static evidence until the actual PostgreSQL concurrency runner passes.

### Feedback causal protocol

Use only the reviewed default-OFF maintained hosted causal profile. Its immutable
source/fixture-bound eight-variant inventory has a strict separate expected-RED
parser: complete plan31, exact failed ordinal set, SQL exit0 and rollback, with
all other assertions green. Bind each target ordinal to a complete unique adjacent
pgTAP no-exception diagnostic and its fixed fixture denial contract; caught SQL
exceptions or absent/malformed/duplicate diagnostics cannot qualify. Inject SQL
with literal callback/slicing, since JavaScript replacement strings interpret dollar
quotes and dollar-apostrophe. Require exact definition bytes and reconstruction of
the original fixture after removing the one injected span. Never weaken the default
GREEN parser. Record the actual function/body/owner/ACL/settings baseline and require
exact post-rollback equality; no compensating restore/retry. Require restoration
GREEN after each variant, terminal278/typegen and positive owned cleanup. Preserve
zero retries/monotonic20-minute phase bound and existing individual deadlines.
The domain-regexp implication is structural only; do not label it a tested mutation.
Keep ACL/registry-availability ordinary coverage distinct. See the existing schema
qualification runbook for target counts, control binding and unexecuted-proof limits.

### Chat initial-settings qualification

Use the existing employee schema lifecycle's default-off
`include_chat_initial_settings` profile for foundation172 + chat25 = 197, never
append chat to every historical profile. Reject other optional profiles and
structured provenance together with chat. Require the same-database committed
synthetic RPC/readback → actual Web POST → strict Dart repository bridge, exact
source/control/run/migration/fixture hashes, nine Web and nine Dart controls,
stopped child groups, marker-owned fixture cleanup and exact database absence.
Reuse trigger-created personal workspace UUIDs and memberships rather than
inserting a second personal workspace. Bind those UUIDs through credit inputs,
SQL envelope validation and marker/creator-guarded cleanup of both actors'
bootstrap rows. Shared synthetic permission fixtures use the three-column
`(ws_id, permission, member_type)` key and explicit `MEMBER` scope; disable only
that shared MEMBER admin default before testing explicit manage/create denial.
The rollback pgTAP packet alone is not committed receipt proof. A phase file or
GREEN employee HTTP flag cannot substitute for this profile's qualified receipt.
Creation-only coverage does not certify native message timestamps or provider,
device, upgrade or production behavior. Keep explicit bridge targets outside
ordinary suite discovery and fail when their actual envelope is absent.
See [schema qualification](../../../../../apps/docs/build/development-tools/employee-schema-qualification.mdx#opt-in-chat-initial-settings-qualification)
for inputs, phase boundaries and evidence. Preserve CI-only dependency setup and
existing local cold-restore/resource holds.

### Employee generated-schema public consumer proof

Use the maintained schema workflow's default-off `include_public_consumer` only
within an admitted disposable schema run. It leaves packet selections/counts
unchanged and excludes chat/diagnostic profiles. The adapter binds actual generated
types to source/control, repository/run/attempt/project, required applied private
function/table digests and complete migration versions/statements digests, rechecking
them after generation and after the public source compiler. Recheck live catalog,
artifact and source/control state again after optional runtimes immediately before
owned database stop. Always preserve cleanup on a failed check; after cleanup,
recheck filesystem artifact/source/control without querying the destroyed database.
Both final fences must pass before the receipt qualifies. It derives source entries from package exports,
uses a disposable Types copy with that generated schema and owning dependencies,
and requires both CREATE names' operation identity plus RESTORE revision and private
schema negative controls. Do not alias a private implementation or fabricate RPC types.

Compiler skip/error/signal/timeout, artifact or catalog drift, failed scratch cleanup,
SQL failure or failed database cleanup cannot produce sourceCompilerQualified.
Emitted public-package acceptance remains false/separate. Checked-in-schema compiler
smoke validates the fixture only; it is not same-database generation/catalog evidence.
See [delivery evidence](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#validation-and-delivery-evidence)
and the root-discovered `scripts/employee-public-consumer-qualification.test.mjs`.


For the Google-destination provider qualification, require a valid disposable
sign-in and nonempty persisted session/refresh-token baselines. Compare complete
rows and run deletion/mutation controls through the actual preservation assertion;
empty-array equality proves no session preservation. The separately opt-in
Google CI hook requires the same published source/control H and address-migration
selection, a real Linux Docker daemon, bounded pinned-image pulls, one provider
process, and durable run-bound primary/cleanup results. Qualification inputs are
CI controls, not runtime activation gates: the migration API uses current root
permission/configuration/readiness with no optional environment flag. The selected
30-case packet fences a real FK-writer table lock on a separate disposable database
connection and verifies unchanged state and cleanup; it does not access production.

### Rejected employee creation adjudication

An `unknown` CREATE cannot ordinarily retry. The dedicated service-only
`adjudicate_employee_creation_rejection` contract admits only the original
administrator's explicitly adjudicated terminal rejection at unknown/version 2,
with exact original identity, expired lease, two-event history, retained intent
and independent current absence guards. Absence and temporal provider logs are
not rejection proof. Preserve all history and target IDs, append the audit event,
then require explicit normal CREATE with a fresh lease and password. See
`apps/docs/build/development-tools/employee-schema-qualification.mdx` for the
operator boundary and canonical rollback/GoTrue/PostgREST regression coverage.

Recovery admission and committed repair readback use the separate service-only
`inspect_employee_creation_rejection` RPC. Candidate eligibility is not rejection
proof. Only a matching committed audit at reserved/version 3 may unlock explicit
same-operation CREATE in the UI; a lost mutation acknowledgement stays fenced.

### Explicit retained-mailbox adoption

Keep the Google-destination empty-only prepare guard unchanged. Populated
placeholders require the separate retained adoption RPC and explicit content
ownership confirmation tied to the original tuple/revision and fresh snapshot.
Confirmation resolves entitlement only for that mailbox; it cannot waive foreign
access, identity, graph or catalog contradictions. Preserve missing historical
provenance rather than fabricating envelopes or reparenting content.

The adoption receipt is distinct from the migration journal. Reconcile lost
acknowledgements by inspecting the original operation; never replay an uncertain
write or replace its UUID. Require committed adoption/readiness before ordinary
reserve/claim/complete. Use the canonical full-schema rollback packet and
same-database type generation; source-only tests or a minimal fixture cannot
qualify SQL. See the retained-adoption section of
`apps/docs/build/development-tools/employee-address-migration.mdx` for its narrow
four-relation allowance, graph rejection rules and operational fences.

### Managed employee profile updates

Use the service-only atomic managed-profile RPC after current request auth. Acquire
shared employee-address admission before the sorted Auth pair and established
registry/intent, mailbox/member, profile and operation locks. Preserve name triggers;
update the validated registry first and call `update_public_user_profile` for
username ownership and quotas. Keep old owned handles, never adopt NULL/foreign
reservations, and roll back every write together. Preserve immutable CREATE
intent/journal names; only terminal active observations with complete append-only
rename and completed-RESTORE revision lineage may expose a separate original
creation name. Missing provenance or current profile/mailbox drift denies proof.
Use the hosted managed-profile schema selection and same-database type artifact;
source checks cannot establish SQL, concurrency or production acceptance.

### Guest table and participant view grants

Meet guest data and the legacy `meet_together_users` participant view are read by
server/admin clients. Revoking a base table does not revoke an owner-rights view:
audit dependent views and their client grants together. Keep service-role access,
and prove both client roles receive permission denial on actual view reads as well
as checking effective privileges. The regression is
`apps/database/supabase/tests/security-meet-guest-grants.sql`; a socket-only PG14
fixture can apply the relevant historical view definition and later grant
migrations against synthetic prerequisite tables without a shared Docker stack.

### Historical NOT VALID checks during backfills

Unchanged payloads are still checked on UPDATE. Audit pending backfills for
legacy size/length violations before deployment. Notification email-copy cleanup
uses the catalog expression for safe batches, then temporarily drops/restores
the exact check only for the oversized tail in one transaction. The table lock
lasts through commit; do not drop the check before the regular scan. Preserve
payload bytes and verify the safe-only path retains the constraint OID. See
[disposable proof requirements](../../../../../apps/docs/build/development-tools/local-supabase-development.mdx#backfills-with-historical-payload-violations).

### Dataset server access

Dataset client grants and RLS policies remain revoked by
`20260312113000_lock_description_tables_to_server_apis`. Use the shared
`apps/web/src/lib/datasets/access.ts` authorization flow, which resolves the actor
and `getPermissions` workspace/`ai_lab` authority before creating a dataset admin
client. Bind the dataset to the verified workspace, and retain its `dataset_id`
on all child reads and mutations. Validate row/column ids inside that parent;
never restore direct client grants as an API repair. See the
[authorization decision](../../../../../apps/docs/platform/architecture/authorization.mdx)
and the opt-in dataset `local-chain.test.ts` for full local Auth/PostgREST checks.

### Cron maintenance after private-schema moves

When moving a function called by pg_cron, inspect and execute the stored
`cron.job.command` on the complete disposable migration chain. Function existence
or direct helper tests do not prove that the schedule still resolves its target.
For the retained pure-SQL dashboard refresh, alter only the command to call
`private.refresh_posts_dashboard_view()`; preserve job id, schedule and active state.
New retention scheduling belongs in Cloudflare Cron Control. Its service-only
`private.prune_cron_history(integer)` RPC bounds each table's oldest completed
seven-day history batch; unfinished executions remain for recovery. See the
[Cron Control runbook](../../../../../apps/docs/build/devops/cloudflare-cron-control.mdx#seven-day-database-cron-history)
and `supabase/tests/cron-history-retention.sql` for the role, budget and replay
regressions. Never add a cleanup pg_cron job to repair an accumulating history table.

### Task list and assignment policies

Before revoking task-list writes, audit direct user-client callers as well as
service-role APIs: the shared list form, board copy/template paths and AI tools
can use RLS. Keep read membership separate from write permission; list writes
require MEMBER plus manage_projects or an edit board share, and assignment
writes also accept an edit task share. Resolve email recipients from confirmed
Auth email. Preserve the restrictive MFA policy and check both boards on moves.
Use `task-list-assignee-authorization.sql` for behavioral regression coverage.
For rollback rehearsals, compare the observed hosted ACLs with replay first:
historical GRANT ALL can include MAINTAIN on PostgreSQL 17 even when the hosted
ACL excludes it. Record that fixture difference separately from migration proof.
### Azure identity-link verification

For Azure account linking, require the explicit provider claim at
`identity_data.custom_claims.xms_edov`; GoTrue's `email_verified` also accepts a
missing claim and cannot stand in for explicit proof. Preserve new-user and
existing-identity update behavior. The
[authentication decision](../../../../../apps/docs/platform/architecture/authentication.mdx#oauth-sign-in)
owns the accepted claim forms and Auth source references; the
`azure-identity-link-verification*.sql` pgTAP suites cover behavior and helper
grants. Replay installation and rollback as the non-superuser `postgres` role:
Auth tables belong to `supabase_auth_admin`, so creating and dropping a trigger
have different privilege requirements.

### Atomic Assistant first-message creation

The native first-message RPC binds a client UUID and request key to an immutable
private creation snapshot. Validate actor/workspace/type before replay, compare
initial settings against the snapshot rather than mutable settings, and keep the
creation and user-message idempotency operation in one transaction. Retain a
minimal tombstone after conversation deletion to deny stale resurrection.
`verify-chat-first-message.mjs` exercises the full isolated migration chain,
rollback cases and a two-connection advisory-lock race. Its baseline/candidate
type generation applies only the new schema delta to the checked-in snapshot.

The first-message rollback restores main's prior chat_create_conversation body
and service-only ACL. Refuse retained creation receipts: removing retry identities
can resurrect deleted conversations. Verify actual apply/rollback/reapply and
prior catalog equality with apps/database/verification/chat-first-message-rollback-*.sql.

### Local independent-session pgTAP fixtures

Use `tests/helpers/local-dblink.inc` before transactions and fixture writes.
Stock Supabase uses SCRAM on `db.supabase.internal:5432`, while loopback trust
does not satisfy non-superuser dblink authentication even when a password is
supplied. Preserve `test.dblink_connstr` for other disposable runners and treat
the helper's connection-unavailable TAP skip as missing concurrency evidence,
not a passing assertion. Verify both the default connection and unavailable-port
skip path; keep later SQL errors fatal. See the local Supabase development
runbook for setup and owned-stack cleanup.

### Meet consent and retention adoption

Keep consent evidence private and client mutations revoked. Exercise actual
client DELETE/UPDATE denials and latest `(created_at, id)` ordering in
`meet-ai-consent-schema.sql`. Retention schema adoption must explicitly replace
the purge function and include a same-file REVOKE ALL plus service-only grant,
with `search_path = pg_catalog, pg_temp` in forward and rollback definitions.
Close the purge fence and withdraw deletion approval when eligibility changes;
require fresh owner approval after dry-run counts. Preserve NULL-as-forever,
backfilled historical deadlines, edited-note erasure and the bounded stop fence.
See the Meet application feature page and transcript retention runbook.

Meet evidence retention uses a session RESTRICT FK and user SET NULL FK. Mint a
random per-session participant UUID on consent insert and reuse it under a session
row lock; never derive it from identity or persist a separate mapping. Auth deletion keeps the public profile, so anonymize consent at an AFTER DELETE
Auth trigger too. The immutable UPDATE trigger must permit only nested
server/Auth deletion anonymization, preserving every
other field. Test Auth/client deletion denial, creator/admin meeting deletion
refusal and explicit service consent-before-session erasure. Keep transcript purge
in-place; it retains consent. See `meet-ai-consent-retention.sql`.
