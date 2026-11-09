import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
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
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private;
    CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
    CREATE TABLE public.users(id uuid PRIMARY KEY);
    CREATE TABLE public.workspace_users(id uuid DEFAULT gen_random_uuid(),ws_id uuid,email text);
    CREATE TABLE public.workspace_secrets(ws_id uuid,name text,value text);
    CREATE TABLE public.email_audit(ws_id uuid,to_addresses text[],cc_addresses text[] DEFAULT '{}',bcc_addresses text[] DEFAULT '{}');
    CREATE TABLE public.email_blacklist(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entry_type text,value text,reason text,created_at timestamptz DEFAULT clock_timestamp(),updated_at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE private.email_bounce_complaints(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email_hash text,event_type text,bounce_type text,created_at timestamptz DEFAULT clock_timestamp());
    CREATE FUNCTION public.is_org_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${actor}'::uuid $$;
    CREATE FUNCTION public.has_workspace_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2 = '${actor}'::uuid AND $1 = '${ws}'::uuid AND $3 = 'admin' $$;
    INSERT INTO public.workspaces VALUES ('${ws}'),('${otherWs}');
    INSERT INTO public.users VALUES ('${actor}'),('${guest}');
    INSERT INTO public.workspace_secrets VALUES ('${ws}','email_blacklist_appeals','true');
  `);
  await db.exec(migration);
  return db;
}

async function seed(
  db,
  email = 'blocked@example.com',
  reason = 'ses_hard_bounce'
) {
  await db.query(
    'INSERT INTO public.workspace_users(ws_id,email) VALUES ($1,$2)',
    [ws, email]
  );
  await db.query(
    "INSERT INTO public.email_blacklist(entry_type,value,reason) VALUES ('email',$1,$2)",
    [email, reason]
  );
}

async function request(
  db,
  email = 'blocked@example.com',
  token = 'token',
  workspace = ws,
  user = actor
) {
  return (
    await db.query(
      'SELECT public.email_appeal_request($1,$2,$3,$4,$5) result',
      [workspace, user, email, 'The mailbox has been repaired.', hash(token)]
    )
  ).rows[0].result;
}
async function delivery(db, id, outcome = 'sent') {
  if (outcome === 'sent' || outcome === 'unknown') {
    const claim = (
      await db.query('SELECT public.email_appeal_claim_delivery($1) result', [
        id,
      ])
    ).rows[0].result;
    assert.equal(claim.status, 'dispatching');
  }
  return (
    await db.query('SELECT public.email_appeal_mark_delivery($1,$2) result', [
      id,
      outcome,
    ])
  ).rows[0].result;
}
async function confirm(db, token = 'token') {
  return (
    await db.query('SELECT public.email_appeal_confirm($1) result', [
      hash(token),
    ])
  ).rows[0].result;
}
async function blocked(db, workspace = ws) {
  return (
    await db.query(
      "SELECT public.email_appeal_block_statuses($1,ARRAY['blocked@example.com']) result",
      [workspace]
    )
  ).rows[0].result[0].is_blocked;
}

test('a complaint arriving during deliverability checks prevents dispatch', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const reserved = await request(db);
    await db.query(
      "INSERT INTO private.email_bounce_complaints(email_hash,event_type) VALUES ($1,'complaint')",
      [hash('blocked@example.com').slice(0, 16)]
    );
    const claim = (
      await db.query('SELECT public.email_appeal_claim_delivery($1) result', [
        reserved.id,
      ])
    ).rows[0].result;
    assert.equal(claim.status, 'reblocked');
    await assert.rejects(
      db.query('SELECT public.email_appeal_mark_delivery($1,$2)', [
        reserved.id,
        'sent',
      ]),
      /email_appeal_delivery_state/
    );
    assert.equal((await confirm(db)).status, 'invalid');
    assert.equal(await blocked(db), true);
  } finally {
    await db.close();
  }
});

test('dispatch claim is single use and refuses expiry, disabled flag and complaints', async () => {
  const db = await fixture();
  const claim = async (id) =>
    (
      await db.query('SELECT public.email_appeal_claim_delivery($1) result', [
        id,
      ])
    ).rows[0].result.status;
  try {
    await seed(db);
    const reserved = await request(db);
    await assert.rejects(
      db.query('SELECT public.email_appeal_mark_delivery($1,$2)', [
        reserved.id,
        'sent',
      ]),
      /email_appeal_delivery_state/
    );
    assert.equal(await claim(reserved.id), 'dispatching');
    assert.equal(await claim(reserved.id), 'invalid');
    await seed(db, 'expired@example.com');
    const expired = await request(db, 'expired@example.com', 'expired');
    await db.query(
      "UPDATE private.email_blacklist_appeals SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [expired.id]
    );
    assert.equal(await claim(expired.id), 'expired');
    await seed(db, 'complaint@example.com', 'ses_complaint');
    const complaint = await request(db, 'complaint@example.com', 'complaint');
    assert.equal(await claim(complaint.id), 'reblocked');
    await seed(db, 'disabled@example.com');
    const disabled = await request(db, 'disabled@example.com', 'disabled');
    await db.exec("UPDATE public.workspace_secrets SET value = 'false'");
    assert.equal(await claim(disabled.id), 'invalid');
    assert.equal(
      (
        await db.query(
          'SELECT status FROM private.email_blacklist_appeals WHERE id = $1',
          [disabled.id]
        )
      ).rows[0].status,
      'failed'
    );
    await db.exec('SET ROLE authenticated');
    await assert.rejects(
      db.query('SELECT public.email_appeal_claim_delivery($1)', [reserved.id]),
      /permission denied/
    );
  } finally {
    await db.close();
  }
});

test('recipient confirmation consumes exactly once and allows only its workspace', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const reserved = await request(db);
    assert.equal(await blocked(db), true);
    assert.equal((await confirm(db)).status, 'invalid');
    await delivery(db, reserved.id);
    assert.equal((await confirm(db, 'tampered')).status, 'invalid');
    assert.equal((await confirm(db)).status, 'confirmed');
    assert.equal((await confirm(db)).status, 'invalid');
    assert.equal(await blocked(db), false);
    assert.equal(await blocked(db, otherWs), true);
    await db.exec("UPDATE public.workspace_secrets SET value = 'false'");
    assert.equal(await blocked(db), true);
    await db.exec("UPDATE public.workspace_secrets SET value = 'true'");
    assert.equal(
      (await db.query('SELECT count(*)::integer n FROM public.email_blacklist'))
        .rows[0].n,
      1
    );
    const persisted = (
      await db.query(
        'SELECT token_hash,reason,actor_id FROM private.email_blacklist_appeals'
      )
    ).rows[0];
    assert.equal(persisted.token_hash, hash('token'));
    assert.equal(persisted.actor_id, actor);
    assert.equal(persisted.reason, 'The mailbox has been repaired.');
    assert.deepEqual(
      (
        await db.query(
          'SELECT outcome FROM private.email_blacklist_appeal_events ORDER BY created_at'
        )
      ).rows.map((x) => x.outcome),
      ['requested', 'dispatching', 'sent', 'confirmed']
    );
  } finally {
    await db.close();
  }
});

test('expired and failed challenges remain blocked and impose cooldown', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const reserved = await request(db);
    await delivery(db, reserved.id);
    await db.query(
      "UPDATE private.email_blacklist_appeals SET expires_at = clock_timestamp() - interval '1 second'"
    );
    assert.equal((await confirm(db)).status, 'expired');
    assert.equal(await blocked(db), true);
    await assert.rejects(
      request(db, 'blocked@example.com', 'retry'),
      /email_appeal_cooldown/
    );
    await seed(db, 'failed@example.com');
    const failed = await request(db, 'failed@example.com', 'failure');
    await delivery(db, failed.id, 'failed');
    assert.equal((await confirm(db, 'failure')).status, 'invalid');
    await assert.rejects(
      request(db, 'failed@example.com', 'retry-failure'),
      /email_appeal_cooldown/
    );
  } finally {
    await db.close();
  }
});

test('complaints need recipient confirmation and manual/domain/unsubscribe bans are immutable', async () => {
  const db = await fixture();
  try {
    await seed(db, 'blocked@example.com', 'ses_complaint');
    const appeal = await request(db);
    await delivery(db, appeal.id, 'waiting_recipient');
    assert.equal((await confirm(db)).status, 'invalid');
    assert.equal(await blocked(db), true);
    for (const reason of ['manual', 'recipient_unsubscribed']) {
      await seed(db, `${reason}@example.com`, reason);
      await assert.rejects(
        request(db, `${reason}@example.com`, reason),
        /email_appeal_not_appealable/
      );
    }
    await db.query(
      "INSERT INTO public.email_blacklist(entry_type,value,reason) VALUES ('domain','example.com','domain ban')"
    );
    await assert.rejects(
      request(db, 'blocked@example.com', 'domain'),
      /email_appeal_not_appealable/
    );
  } finally {
    await db.close();
  }
});

test('new bounce or complaint revokes verified allows and escalates cooldown', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const reserved = await request(db);
    await delivery(db, reserved.id);
    await confirm(db);
    await db.query(
      "INSERT INTO private.email_bounce_complaints(email_hash,event_type,bounce_type) VALUES ($1,'bounce','hard')",
      [hash('blocked@example.com').slice(0, 16)]
    );
    assert.equal(await blocked(db), true);
    assert.equal(
      (await db.query('SELECT status FROM private.email_blacklist_appeals'))
        .rows[0].status,
      'reblocked'
    );
    await assert.rejects(
      request(db, 'blocked@example.com', 'retry'),
      /email_appeal_cooldown/
    );
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until = clock_timestamp() - interval '1 second',created_at = clock_timestamp() - interval '8 days'"
    );
    const second = await request(db, 'blocked@example.com', 'second');
    await delivery(db, second.id);
    await confirm(db, 'second');
    await db.query(
      "INSERT INTO private.email_bounce_complaints(email_hash,event_type) VALUES ($1,'complaint')",
      [hash('blocked@example.com').slice(0, 16)]
    );
    assert.equal(await blocked(db), true);
    const cooldown = (
      await db.query(
        'SELECT extract(epoch FROM cooldown_until-clock_timestamp())/3600 hours FROM private.email_blacklist_appeals WHERE id = $1',
        [second.id]
      )
    ).rows[0].hours;
    assert.ok(Number(cooldown) > 95);
  } finally {
    await db.close();
  }
});

test('workspace and address quotas reject excess appeals', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 10; i++) {
      await seed(db, `recipient${i}@example.com`);
      await request(db, `recipient${i}@example.com`, `token${i}`);
    }
    await seed(db, 'eleventh@example.com');
    await assert.rejects(
      request(db, 'eleventh@example.com', 'eleventh'),
      /email_appeal_workspace_limit/
    );
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET created_at = clock_timestamp() - interval '2 days',cooldown_until = clock_timestamp() - interval '1 second',expires_at = clock_timestamp() - interval '1 second'"
    );
    await request(db, 'recipient0@example.com', 'second');
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until = clock_timestamp() - interval '1 second',expires_at = clock_timestamp() - interval '1 second'"
    );
    await request(db, 'recipient0@example.com', 'third');
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until = clock_timestamp() - interval '1 second',expires_at = clock_timestamp() - interval '1 second'"
    );
    await assert.rejects(
      request(db, 'recipient0@example.com', 'fourth'),
      /email_appeal_address_limit/
    );
  } finally {
    await db.close();
  }
});

test('admin permission, recipient scoping, grants, search and pagination', async () => {
  const db = await fixture();
  try {
    await seed(db);
    await seed(db, 'second@example.com', 'ses_complaint');
    await db.query(
      "INSERT INTO public.email_blacklist(entry_type,value,reason) VALUES ('email','foreign@example.com','ses_hard_bounce')"
    );
    await assert.rejects(
      request(db, 'blocked@example.com', 'guest', ws, guest),
      /email_appeal_forbidden/
    );
    await assert.rejects(
      request(db, 'foreign@example.com', 'foreign'),
      /email_appeal_recipient/
    );
    const result = (
      await db.query(
        "SELECT public.email_appeal_list($1,$2,'example',0,1) result",
        [ws, actor]
      )
    ).rows[0].result;
    assert.equal(result.total, 2);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].email, 'blocked@example.com');
    assert.equal(result.entries[0].appealable, true);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(
      db.query('SELECT public.email_appeal_confirm($1)', [hash('token')]),
      /permission denied/
    );
    await assert.rejects(
      db.query('SELECT * FROM private.email_blacklist_appeals'),
      /permission denied/
    );
    await db.exec('RESET ROLE');
    await db.exec(rollback);
    await db.exec(migration);
  } finally {
    await db.close();
  }
});
