# SePay Webhook + Auto-Categorization Implementation Plan
## 1) Goal
Build a production-grade SePay integration that requires **zero manual setup in SePay UI** for end users, while automatically:
- ingesting transaction webhooks,
- determining income/outcome,
- selecting the best transaction category via LLM + tools + Zod validation,
- deduplicating retries safely,
- and writing into existing finance tables (`wallet_transactions`, `transaction_categories`) in Supabase.
---
## 2) Final Product Decisions (Locked)
- **SePay setup UX:** zero manual in SePay (use SePay OAuth2 + Webhooks API automation).
- **Webhook topology:** one endpoint handling many token contexts.
- **Auth mode:** API key validation on incoming webhook delivery (server-side verification).
- **Direction rule:** infer from `transferType` (`in` = income, `out` = expense).
- **Amount storage:** always positive amount in `wallet_transactions.amount`.
- **Idempotency:** SePay `id` as primary dedupe key.
- **Category fallback:** auto-use default bucket; auto-create if missing:
  - `Uncategorized Income`
  - `Uncategorized Expense`
- **Confidence threshold:** **medium** (`>= 0.6`) for accepting LLM category pick.
- **Creator attribution:** use a workspace **system virtual user**.
- **Wallet mapping fallback:** auto-create wallet from SePay bank account metadata.
- **Provisioning:** Admin API first (UI can follow).
---
## 3) Scope
### In scope
- OAuth onboarding + token storage/refresh.
- Automatic webhook registration to SePay.
- Webhook ingestion endpoint with strict validation.
- Event persistence + replay-safe processing.
- LLM category classification + guardrails.
- Auto wallet creation and fallback category creation.
- Admin APIs for token/webhook management.
- Tests, observability, and rollout controls.
### Out of scope (phase 2+)
- Full settings UI polish for integration management.
- Complex user-defined classification rules engine.
- Multi-provider finance ingestion unification.
---
## 4) Architecture Overview
1. User connects SePay in app via OAuth.
2. Backend stores SePay OAuth credentials (encrypted) and fetches bank accounts.
3. Backend maps/creates workspace wallets for each bank account.
4. Backend creates/updates SePay webhooks through SePay OAuth API:
   - webhook URL points to our single endpoint (`/api/v1/webhooks/sepay/[token]` or equivalent tokenized route).
5. SePay sends transaction webhook.
6. Ingestion pipeline:
   - verify auth + parse payload (Zod),
   - resolve workspace/wallet via token/context,
   - persist event row,
   - idempotency check,
   - classify category via LLM + structured output + threshold,
   - fallback if needed,
   - write `wallet_transactions`,
   - mark event processed.
7. Monitoring surface reads event + sync logs.
---
## 5) Data Model Plan (Supabase)
## 5.1 New table: `sepay_connections`
Stores workspace-level SePay OAuth linkage.
Suggested columns:
- `id` (uuid pk)
- `ws_id` (uuid, fk workspaces)
- `sepay_company_id` (text nullable)
- `access_token_encrypted` (text)
- `refresh_token_encrypted` (text)
- `access_token_expires_at` (timestamptz)
- `scopes` (text[])
- `status` (`active|revoked|error`)
- `created_at`, `updated_at`
- unique: `ws_id`
## 5.2 New table: `sepay_wallet_links`
Maps SePay bank account/sub-account to workspace wallet.
Suggested columns:
- `id` (uuid pk)
- `ws_id` (uuid)
- `sepay_bank_account_id` (bigint/text)
- `sepay_sub_account_id` (bigint/text nullable)
- `sepay_account_number` (text nullable)
- `sepay_gateway` (text nullable)
- `wallet_id` (uuid fk workspace_wallets)
- `active` (bool default true)
- `metadata` (jsonb)
- unique composite for stable mapping.
## 5.3 New table: `sepay_webhook_endpoints`
Tracks webhook endpoint/token context.
Suggested columns:
- `id` (uuid pk)
- `ws_id` (uuid)
- `wallet_id` (uuid nullable if account-level)
- `token_hash` (text unique)
- `token_prefix` (text)
- `active` (bool)
- `sepay_webhook_id` (bigint/text nullable)
- `created_at`, `rotated_at`, `last_used_at`
## 5.4 New table: `sepay_webhook_events`
Audit + idempotency + processing state.
Suggested columns:
- `id` (uuid pk)
- `ws_id`, `wallet_id`
- `endpoint_id` (fk `sepay_webhook_endpoints`)
- `sepay_event_id` (bigint/text)
- `reference_code` (text nullable)
- `transfer_type` (text)
- `transfer_amount` (numeric)
- `transaction_date` (timestamptz/text normalized)
- `payload` (jsonb)
- `status` (`received|processed|duplicate|failed`)
- `failure_reason` (text nullable)
- `created_transaction_id` (uuid nullable fk `wallet_transactions`)
- `received_at`, `processed_at`
- unique primary dedupe: `(ws_id, wallet_id, sepay_event_id)`
Optional fallback unique index when `sepay_event_id` missing:
- `(ws_id, wallet_id, reference_code, transfer_type, transfer_amount, transaction_date)`
---
## 6) Backend API Plan
## 6.1 OAuth and provisioning APIs
- `POST /api/v1/workspaces/[wsId]/integrations/sepay/oauth/start`
- `GET /api/v1/workspaces/[wsId]/integrations/sepay/oauth/callback`
- `POST /api/v1/workspaces/[wsId]/integrations/sepay/sync-bank-accounts`
- `POST /api/v1/workspaces/[wsId]/integrations/sepay/provision-webhooks`
- `POST /api/v1/workspaces/[wsId]/integrations/sepay/disconnect`
## 6.2 Admin token/endpoint APIs (phase 1 required)
- `POST /api/v1/workspaces/[wsId]/integrations/sepay/endpoints`
- `POST /api/v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]/rotate`
- `DELETE /api/v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]`
- `GET /api/v1/workspaces/[wsId]/integrations/sepay/endpoints`
## 6.3 Ingestion endpoint
- `POST /api/v1/webhooks/sepay/[token]`
Responsibilities:
- Verify incoming `Authorization` header format and secret.
- Parse/validate body via Zod schema.
- Resolve endpoint token -> workspace/wallet context.
- Persist raw event row.
- Process idempotently.
- Return JSON `{ success: true }` with 200/201 quickly.
---
## 7) Classification Engine Plan (LLM + Tools + Zod)
## 7.1 Inputs to classifier
- SePay fields: `content`, `description`, `code`, `referenceCode`, `gateway`, `transferType`, `transferAmount`.
- Candidate categories in workspace filtered by direction:
  - income => `is_expense = false`
  - expense => `is_expense = true`
- Candidate metadata:
  - `id`, `name`, `icon`, `color`,
  - optional historical signals (future enhancement).
## 7.2 Structured output contract
Use Zod schema for model output:
- `categoryId: z.guid()`
- `confidence: z.number().min(0).max(1)`
- `reason: z.string().max(...)`
## 7.3 Acceptance rules
- Category must exist in candidate set.
- Direction parity must match transfer type.
- Accept only if `confidence >= 0.6`.
- Otherwise fallback to default category ID.
## 7.4 Fallback behavior
- Ensure/create:
  - `Uncategorized Income` (`is_expense=false`)
  - `Uncategorized Expense` (`is_expense=true`)
- Assign fallback category.
- Never block transaction ingestion on classification miss.
---
## 8) Wallet Resolution Plan
Priority order:
1. Token context mapping to wallet (primary).
2. `sepay_wallet_links` by bank/sub-account metadata.
3. Auto-create wallet from account metadata and persist mapping.
Auto-created wallet defaults:
- name from gateway + account suffix,
- default currency/workspace finance defaults,
- `report_opt_in` true.
---
## 9) Creator Attribution Plan
Use a dedicated workspace system virtual user (`creator_id`) for webhook-generated transactions.
Implementation notes:
- Resolve or create linkage via existing workspace user link patterns.
- Reuse existing finance route approach for virtual user linkage where possible.
---
## 10) Security Plan
- Validate webhook auth header and reject unauthorized requests.
- Store only hashed endpoint tokens.
- Encrypt SePay OAuth access/refresh tokens at rest.
- Limit route bypasses and keep proxy guard parity.
- Add optional SePay source IP allowlist check (defense-in-depth).
- Apply strict JSON schema validation and safe error handling.
- Avoid logging secrets/tokens/full sensitive payloads.
---
## 11) Reliability + Idempotency Plan
- First write raw webhook event row.
- Process in transaction-like sequence with dedupe checks.
- Handle duplicate retries as no-op success.
- Persist terminal statuses (`processed|duplicate|failed`) with reasons.
- Optional async retry worker for recoverable failures.
- Keep webhook response fast to minimize SePay retries.
---
## 12) User-Facing Product Flow
1. User clicks `Connect SePay`.
2. OAuth consent and return.
3. App auto-syncs accounts, creates wallet links, provisions webhooks.
4. Live status card appears:
   - Connected,
   - Last webhook received,
   - Last sync time,
   - Error indicator.
5. Transactions appear automatically, categorized and tagged as SePay-imported.
6. Unknown wallet accounts auto-create wallets.
7. Classification misses still post into Uncategorized buckets.
---
## 13) Testing Plan
## 13.1 Unit tests
- SePay payload schema parsing.
- Auth verification.
- Token lookup and inactive token rejection.
- Category acceptance threshold behavior (`0.6`).
- Fallback category ensure/create logic.
- Deduplication key handling.
## 13.2 Integration tests
- OAuth callback + provisioning flow.
- Webhook happy path inserts one transaction.
- Duplicate webhook retries do not duplicate transaction.
- `in/out` mapping correctness with positive amount.
- Auto wallet creation from new account metadata.
- Failure paths mark event failed with reason.
## 13.3 Regression checks
- Existing finance transactions routes remain unaffected.
- Permission enforcement for admin APIs.
- Repo checks on touched TS modules.
---
## 14) Rollout Plan
## Phase 1 (backend complete, minimal UX)
- Migrations + backend APIs + webhook ingestion + classifier + logs.
- Feature flag per workspace.
- Internal pilot workspaces.
## Phase 2 (operator UX)
- Integration status panel.
- Manual reprocess controls.
- Endpoint rotate/revoke controls in settings UI.
## Phase 3 (quality improvements)
- Learning feedback loop for classification.
- Rule-based overrides per workspace.
- Better analytics and alerting.
---
## 15) Observability Plan
Track metrics:
- webhook requests/sec
- auth failures
- parse failures
- dedupe hit rate
- classification acceptance vs fallback ratio
- processing latency
- transaction insert failures
Add dashboards and alert thresholds for:
- sustained failed webhook rate
- token refresh failures
- provisioning drift (missing webhooks).
---
## 16) Acceptance Criteria (Definition of Done)
- User can connect SePay without manual SePay configuration.
- Webhooks are automatically created and active via OAuth API.
- Incoming events create exactly one finance transaction per unique SePay event.
- Direction and category assignment work with threshold + fallback.
- Unknown accounts auto-create wallets and continue ingesting.
- Audit trail exists for every received event and processing state.
- Security controls in place (auth, token hashing, encrypted OAuth tokens).
- Tests cover happy path + retries + failures.
---
## 17) Implementation Checklist (Execution Order)
1. Create Supabase migrations (4 new tables + constraints/indexes).
2. Build OAuth connect/callback and token storage/refresh.
3. Build bank account sync + wallet link auto-create logic.
4. Build webhook provisioning client to SePay OAuth API.
5. Build webhook ingestion endpoint with Zod validation and auth checks.
6. Build idempotent event persistence workflow.
7. Build LLM classifier module with candidate tools + Zod output.
8. Add fallback category ensure/create utility.
9. Insert into `wallet_transactions` with system virtual user.
10. Add admin APIs for endpoint/token lifecycle.
11. Add tests (unit + integration).
12. Add observability + rollout flag controls.
13. Prepare brief operator docs/runbook.
---
## 18) Risks and Mitigations
- **SePay API limits/throttling:** backoff + retry queue + jitter.
- **OAuth token expiry:** proactive refresh and reconnect flow.
- **Misclassification:** threshold + strict candidate filtering + fallback buckets.
- **Duplicate deliveries:** unique constraints + idempotent processing.
- **Webhook drift/deletion on SePay side:** periodic reconciliation job.