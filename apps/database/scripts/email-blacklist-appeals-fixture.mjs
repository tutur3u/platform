import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261109115000_email_blacklist_appeals.sql',
    import.meta.url
  ),
  'utf8'
);
const rollback = await readFile(
  new URL(
    '../rollbacks/20261109115000_email_blacklist_appeals.rollback.sql',
    import.meta.url
  ),
  'utf8'
);
const ws = '00000000-0000-4000-8000-000000000001';
const otherWs = '00000000-0000-4000-8000-000000000002';
const actor = '00000000-0000-4000-8000-000000000003';
const guest = '00000000-0000-4000-8000-000000000004';
const recipient = '00000000-0000-4000-8000-000000000005';
const email = 'blocked@example.com';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const binding = {
  grant_id: 'reviewed-test',
  source_account_id: '111111111111',
  source_region: 'ap-southeast-1',
  account_id: '222222222222',
  region: 'ap-southeast-1',
  identity: 'verify@example.com',
  configuration_set: 'appeal-confirmation',
  ip_pool: 'transactional',
  purpose: 'workspace_report_reenable',
  confirmation_origin: 'https://tuturuuu.com',
};
const reportBinding = {
  ...binding,
  purpose: 'workspace_report',
  identity: 'reports@example.com',
  configuration_set: 'workspace-reports',
};
const providerGeneration = hash('source-and-recovery-provider-generation');
const requestTokens = new Map();
const row = async (db, id) =>
  (
    await db.query(
      'SELECT * FROM private.email_blacklist_appeals WHERE id=$1',
      [id]
    )
  ).rows[0];
const result = async (db, sql, args = []) =>
  (await db.query(sql, args)).rows[0].result;

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,email_confirmed_at timestamptz,deleted_at timestamptz,is_anonymous boolean DEFAULT false,banned_until timestamptz);
    CREATE TABLE public.workspaces(id uuid PRIMARY KEY,name text DEFAULT 'Trusted workspace');
    CREATE TABLE public.users(id uuid PRIMARY KEY);
    CREATE TABLE public.workspace_users(id uuid DEFAULT gen_random_uuid(),ws_id uuid,email text);
    CREATE TABLE public.workspace_secrets(ws_id uuid,name text,value text);
    CREATE TABLE public.email_audit(ws_id uuid,to_addresses text[],cc_addresses text[] DEFAULT '{}',bcc_addresses text[] DEFAULT '{}');
    CREATE TABLE public.email_blacklist(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entry_type text,value text,reason text,created_at timestamptz DEFAULT clock_timestamp(),updated_at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE private.external_user_monthly_reports(id uuid PRIMARY KEY,user_id uuid,report_approval_status text);
    CREATE TABLE private.user_report_email_queue(id uuid PRIMARY KEY,report_id uuid,ws_id uuid,user_id uuid,recipient_email text,delivery_kind text DEFAULT 'send',status text,locked_at timestamptz,locked_by text);
    CREATE TABLE private.email_bounce_complaints(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email_hash text,event_type text,bounce_type text,created_at timestamptz DEFAULT clock_timestamp());
    CREATE FUNCTION public.is_org_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${actor}'::uuid $$;
    CREATE FUNCTION public.has_workspace_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='${actor}'::uuid AND $1='${ws}'::uuid AND $3='admin' $$;
    INSERT INTO public.workspaces(id) VALUES ('${ws}'),('${otherWs}');
    INSERT INTO public.users VALUES ('${actor}'),('${guest}');
    INSERT INTO public.workspace_secrets VALUES ('${ws}','email_blacklist_appeals','true');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('${recipient}','${email}',clock_timestamp()),('${guest}','other@example.com',clock_timestamp());
  `);
  await db.exec(migration);
  assert.equal(
    await result(db, 'SELECT public.email_appeal_transport_binding() result'),
    null
  );
  await db.query(
    'UPDATE private.email_appeal_transport_control SET enabled=true,provider_policy_approved=true,report_policy_approved=true,binding=$1,report_binding=$2',
    [binding, reportBinding]
  );
  return db;
}

async function seed(db, address = email, reason = 'ses_hard_bounce') {
  await db.query(
    'INSERT INTO public.workspace_users(ws_id,email) VALUES ($1,$2)',
    [ws, address]
  );
  await db.query(
    "INSERT INTO public.email_blacklist(entry_type,value,reason) VALUES ('email',$1,$2)",
    [address, reason]
  );
  await db.query(
    'INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,$2,clock_timestamp()) ON CONFLICT(email) DO NOTHING',
    [randomUUID(), address]
  );
  await providerStatus(db, address, { suppressed: false });
}
async function providerStatus(db, address, status) {
  return result(
    db,
    'SELECT public.email_appeal_record_provider_status($1,$2,$3,$4) result',
    [
      ws,
      actor,
      address,
      {
        account_id: binding.source_account_id,
        region: binding.source_region,
        provider_generation: providerGeneration,
        ...status,
      },
    ]
  );
}
async function request(
  db,
  address = email,
  token = 'token',
  workspace = ws,
  user = actor
) {
  const reserved = await result(
    db,
    'SELECT public.email_appeal_request($1,$2,$3,$4,$5) result',
    [
      workspace,
      user,
      address,
      'The mailbox has been repaired.',
      hash(`placeholder:${token}`),
    ]
  );
  requestTokens.set(reserved.id, token);
  return reserved;
}
async function claims(db, id) {
  const appeal = await row(db, id);
  return {
    appealId: id,
    wsId: appeal.ws_id,
    recipientHash: hash(appeal.email),
    purpose: 'workspace_report_reenable',
    generation: appeal.suppression.fingerprint,
    expiresAt:
      appeal.expires_at instanceof Date
        ? appeal.expires_at.getTime()
        : Date.parse(appeal.expires_at),
  };
}
async function bootstrap(db, id, user, overrides = {}) {
  const appeal = await row(db, id);
  const target =
    user ??
    (await db.query('SELECT id FROM auth.users WHERE email=$1', [appeal.email]))
      .rows[0].id;
  return result(
    db,
    'SELECT public.email_appeal_claim_bootstrap($1,$2,$3,$4) result',
    [
      id,
      target,
      hash(requestTokens.get(id)),
      { ...(await claims(db, id)), ...overrides },
    ]
  );
}
async function claim(
  db,
  id,
  transport = binding,
  generation = providerGeneration
) {
  return result(
    db,
    'SELECT public.email_appeal_claim_delivery($1,$2,$3) result',
    [id, transport, generation]
  );
}
async function mark(db, id, outcome = 'sent') {
  return result(
    db,
    'SELECT public.email_appeal_mark_delivery($1,$2,$3) result',
    [id, outcome, outcome === 'sent' ? `message-${id}` : null]
  );
}
async function send(db, id, outcome = 'sent') {
  assert.equal((await bootstrap(db, id)).status, 'verifying');
  assert.equal((await claim(db, id)).status, 'dispatching');
  return mark(db, id, outcome);
}
async function confirm(db, id, overrides = {}) {
  return result(db, 'SELECT public.email_appeal_confirm($1,$2) result', [
    hash(requestTokens.get(id)),
    { ...(await claims(db, id)), ...overrides },
  ]);
}
async function preview(db, id, overrides = {}) {
  return result(db, 'SELECT public.email_appeal_preview($1,$2) result', [
    hash(requestTokens.get(id)),
    { ...(await claims(db, id)), ...overrides },
  ]);
}
async function blocked(db, workspace = ws) {
  return (
    await result(
      db,
      'SELECT public.email_appeal_block_statuses($1,$2) result',
      [workspace, [email]]
    )
  )[0].is_blocked;
}
async function feedback(db, id, overrides = {}) {
  const p = {
    eventId: 'event-one',
    dispatchId: (await row(db, id)).dispatch_id,
    dispatchKind: 'confirmation',
    identity: binding.identity,
    configurationSet: binding.configuration_set,
    messageId: `message-${id}`,
    accountId: binding.account_id,
    region: binding.region,
    address: email,
    workspace: ws,
    type: 'bounce',
    bounceType: 'hard',
    ...overrides,
  };
  return result(
    db,
    'SELECT public.email_appeal_feedback($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result',
    [
      p.eventId,
      p.messageId,
      p.accountId,
      p.region,
      p.address,
      p.workspace,
      p.type,
      p.bounceType,
      id,
      p.dispatchId,
      p.dispatchKind,
      p.identity,
      p.configurationSet,
    ]
  );
}

export {
  migration,
  rollback,
  ws,
  otherWs,
  actor,
  guest,
  recipient,
  email,
  hash,
  binding,
  reportBinding,
  providerGeneration,
  row,
  result,
  fixture,
  seed,
  providerStatus,
  request,
  claims,
  bootstrap,
  claim,
  mark,
  send,
  confirm,
  preview,
  blocked,
  feedback,
};
