// Policy-change notice send ledger. Runs the real migration and its static
// rollback against a synthetic in-memory PGlite schema. Fixture addresses
// only; no real database, queue or email provider is involved.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const MIGRATION = '20261104180000_policy_notice_send_ledger';
const NOTICE = 'policy-change-2026-11-11';
const V1 = 'v3-aaaaaaaaaaaa';
const V2 = 'v3-bbbbbbbbbbbb';
const ACTOR = '00000000-0000-4000-8000-0000000000aa';

const hash = (email) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = new PGlite();
  await db.exec(await read('scripts/fixtures/policy-notice-ledger-schema.sql'));
  await db.exec(await read(`supabase/migrations/${MIGRATION}.sql`));
  // The staff operator: an account without an address, so never a recipient.
  await db.query('insert into auth.users (id) values ($1)', [ACTOR]);
  return db;
}

// Users 1..12 with workspaces covering every audience rule.
async function seedAudience(db) {
  const users = [
    [1, 'owner@example.com'], // owns a team workspace
    [2, 'Admin@Example.com'], // admin through a role (mixed case)
    [3, 'default-admin@example.com'], // admin through member defaults
    [4, 'member@example.com'], // plain member: not in the audience
    [5, 'guest@example.com'], // guest with an admin role: not in the audience
    [6, 'unconfirmed@example.com'], // owner, email unconfirmed
    [7, 'deleted@example.com'], // owner, account deleted
    [8, 'banned@example.com'], // owner, banned
    [9, 'personal@example.com'], // owns only a personal workspace
    [10, 'gone-ws@example.com'], // owns only a deleted workspace
    [11, 'multi@example.com'], // owns two and admins one: exactly one email
    [12, null], // owner without an address
  ];
  for (const [n, email] of users) {
    await db.query(
      `insert into auth.users (id, email, email_confirmed_at, deleted_at, banned_until)
       values ($1, $2, case when $3 then null else now() end,
               case when $4 then now() end,
               case when $5 then now() + interval '1 day' end)`,
      [uid(n), email, n === 6, n === 7, n === 8]
    );
  }
  const ws = async (id, creator, opts = {}) =>
    db.query(
      'insert into public.workspaces (id, creator_id, deleted, personal) values ($1, $2, $3, $4)',
      [
        uid(100 + id),
        uid(creator),
        opts.deleted ?? false,
        opts.personal ?? false,
      ]
    );
  await ws(1, 1);
  await ws(2, 6);
  await ws(3, 7);
  await ws(4, 8);
  await ws(5, 9, { personal: true });
  await ws(6, 10, { deleted: true });
  await ws(7, 11);
  await ws(8, 11);
  await ws(9, 12);
  const member = (w, u, type = 'MEMBER') =>
    db.query(
      'insert into public.workspace_members (ws_id, user_id, type) values ($1, $2, $3)',
      [uid(100 + w), uid(u), type]
    );
  await member(1, 2);
  await member(1, 4);
  await member(1, 5, 'GUEST');
  await member(7, 3);
  await member(1, 11);
  await db.query('insert into public.workspace_roles values ($1, $2)', [
    uid(201),
    uid(101),
  ]);
  for (const u of [2, 5, 11]) {
    await db.query(
      'insert into public.workspace_role_members values ($1, $2)',
      [uid(201), uid(u)]
    );
  }
  await db.query(
    `insert into public.workspace_role_permissions (role_id, ws_id, permission)
     values ($1, $2, 'admin')`,
    [uid(201), uid(101)]
  );
  await db.query(
    `insert into public.workspace_default_permissions (ws_id, member_type, permission)
     values ($1, 'MEMBER', 'admin')`,
    [uid(107)]
  );
}

async function asService(db, sql, params = []) {
  await db.exec('set role service_role');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function audience(db, includePersonal) {
  const { rows } = await asService(
    db,
    `select recipient_hash, email, suppression
       from private.policy_notice_next_recipients($1, $2, $3, 100)`,
    [NOTICE, V1, includePersonal]
  );
  return rows;
}

async function startRun(db, mode, version = V1) {
  const { rows } = await asService(
    db,
    'select private.policy_notice_start_run($1, $2, $3, $4) as id',
    [NOTICE, version, mode, ACTOR]
  );
  return rows[0].id;
}

async function finishRun(db, runId, status, counts = null) {
  await asService(
    db,
    'select private.policy_notice_finish_run($1, $2, null, $3::jsonb)',
    [runId, status, counts === null ? null : JSON.stringify(counts)]
  );
}

async function claim(db, runId, email, suppression = null) {
  const { rows } = await asService(
    db,
    'select private.policy_notice_claim($1, $2, $3) as claimed',
    [runId, hash(email), suppression]
  );
  return rows[0].claimed;
}

async function record(db, runId, email, status, messageId = null) {
  const { rows } = await asService(
    db,
    'select private.policy_notice_record($1, $2, $3, null, $4) as ok',
    [runId, hash(email), status, messageId]
  );
  return rows[0].ok;
}

async function gateOpen(db, version = V1) {
  const dry = await startRun(db, 'dry_run', version);
  await finishRun(db, dry, 'completed', {
    eligible: 1,
    suppressed: 0,
    already_sent: 0,
  });
  const preview = await startRun(db, 'test_list', version);
  assert.equal(await claim(db, preview, 'owner@example.com'), true);
  assert.equal(
    await record(db, preview, 'owner@example.com', 'sent', 'ses-1'),
    true
  );
  await finishRun(db, preview, 'completed');
}

test('audience is workspace owners and admins only, one row per address', async () => {
  const db = await setup();
  await seedAudience(db);

  const emails = (await audience(db, true)).map((r) => r.email).sort();
  assert.deepEqual(emails, [
    'admin@example.com',
    'default-admin@example.com',
    'multi@example.com',
    'owner@example.com',
    'personal@example.com',
  ]);
  const teamOnly = (await audience(db, false)).map((r) => r.email);
  assert.equal(teamOnly.includes('personal@example.com'), false);
  for (const row of await audience(db, true)) {
    assert.equal(row.recipient_hash, hash(row.email));
  }
});

test('hard bounces, complaints and do-not-send entries always classify as suppressed', async () => {
  const db = await setup();
  await seedAudience(db);
  await db.exec(`
    insert into public.email_bounce_complaints (email_hash, event_type, bounce_type) values
      ('${hash('owner@example.com')}', 'bounce', 'hard'),
      ('${hash('admin@example.com').slice(0, 16)}', 'complaint', null),
      ('${hash('multi@example.com')}', 'bounce', 'soft');
    insert into public.email_blacklist (entry_type, value, reason) values
      ('email', 'default-admin@example.com', 'recipient_unsubscribed'),
      ('domain', 'blocked.example', 'admin ban'),
      ('email', 'erased@example.com', 'erasure request');
  `);
  const { rows } = await asService(
    db,
    `select email, suppression from private.policy_notice_classify($1)
      order by email`,
    [
      [
        'owner@example.com',
        'admin@example.com',
        'default-admin@example.com',
        'multi@example.com',
        'someone@blocked.example',
        'Erased@Example.com',
      ],
    ]
  );
  assert.deepEqual(
    rows.map((r) => [r.email, r.suppression]),
    [
      ['admin@example.com', 'complaint'],
      ['default-admin@example.com', 'unsubscribed'],
      ['erased@example.com', 'blocked'],
      ['multi@example.com', null],
      ['owner@example.com', 'hard_bounce'],
      ['someone@blocked.example', 'blocked'],
    ]
  );
});

test('dry-run counts return integers only and follow the unsubscribe switch', async () => {
  const db = await setup();
  await seedAudience(db);
  await db.exec(`
    insert into public.email_blacklist (entry_type, value, reason) values
      ('email', 'owner@example.com', 'recipient_unsubscribed'),
      ('email', 'multi@example.com', 'hard bounce');
  `);
  const counts = async (honour) =>
    (
      await asService(
        db,
        'select * from private.policy_notice_counts($1, $2, true, $3)',
        [NOTICE, V1, honour]
      )
    ).rows[0];

  const send = await counts(false);
  assert.deepEqual(Object.keys(send).sort(), [
    'already_sent',
    'eligible',
    'previously_failed',
    'suppressed',
  ]);
  assert.deepEqual(send, {
    eligible: 4,
    suppressed: 1,
    already_sent: 0,
    previously_failed: 0,
  });
  assert.deepEqual(await counts(true), {
    eligible: 3,
    suppressed: 2,
    already_sent: 0,
    previously_failed: 0,
  });
});

test('real sends refuse until a dry run and a test-list send exist for that version', async () => {
  const db = await setup();
  await assert.rejects(startRun(db, 'test_list'), /dry_run_required/);
  await assert.rejects(startRun(db, 'live'), /dry_run_required/);

  const dry = await startRun(db, 'dry_run');
  await finishRun(db, dry, 'completed', {
    eligible: 0,
    suppressed: 0,
    already_sent: 0,
  });
  await assert.rejects(startRun(db, 'live'), /test_send_required/);

  const preview = await startRun(db, 'test_list');
  assert.equal(await claim(db, preview, 'owner@example.com'), true);
  // A claimed but unsent preview does not open the gate.
  await assert.rejects(startRun(db, 'live'), /test_send_required/);
  assert.equal(
    await record(db, preview, 'owner@example.com', 'sent', 'ses-1'),
    true
  );
  assert.ok(await startRun(db, 'live'));
  // Gates are per version: a new version starts closed.
  await assert.rejects(startRun(db, 'live', V2), /dry_run_required/);
});

test('the ledger is idempotent per recipient and notice version', async () => {
  const db = await setup();
  await gateOpen(db);
  const live = await startRun(db, 'live');

  // The preview recipient already has a row for this version.
  assert.equal(await claim(db, live, 'owner@example.com'), false);
  assert.equal(await claim(db, live, 'admin@example.com'), true);
  assert.equal(await claim(db, live, 'ADMIN@example.com '), false);
  assert.equal(
    await record(db, live, 'admin@example.com', 'sent', 'ses-2'),
    true
  );
  // A terminal row is never rewritten (no resend, no reminder).
  assert.equal(await record(db, live, 'admin@example.com', 'failed'), false);
  assert.equal(await claim(db, live, 'blocked@example.com', 'blocked'), true);

  const { rows } = await db.query(
    `select status, suppression, ses_message_id from private.policy_notice_deliveries
      where recipient_hash = $1`,
    [hash('blocked@example.com')]
  );
  assert.deepEqual(rows, [
    { status: 'suppressed', suppression: 'blocked', ses_message_id: null },
  ]);
});

test('a notice is locked to the first version that went out live', async () => {
  const db = await setup();
  await gateOpen(db, V1);
  const live = await startRun(db, 'live', V1);
  assert.equal(await claim(db, live, 'admin@example.com'), true);
  assert.equal(
    await record(db, live, 'admin@example.com', 'sent', 'ses-3'),
    true
  );

  await gateOpen(db, V2);
  await assert.rejects(startRun(db, 'live', V2), /version_locked/);
});

test('next recipients skip every address already in the ledger', async () => {
  const db = await setup();
  await seedAudience(db);
  await gateOpen(db);
  const live = await startRun(db, 'live');
  assert.equal(await claim(db, live, 'admin@example.com'), true);
  assert.equal(await record(db, live, 'admin@example.com', 'unknown'), true);

  const emails = (await audience(db, true)).map((r) => r.email);
  assert.equal(emails.includes('owner@example.com'), false);
  assert.equal(emails.includes('admin@example.com'), false);
  assert.equal(emails.length, 3);
});

test('health counts provider rejections and later bounces and complaints', async () => {
  const db = await setup();
  await gateOpen(db);
  const live = await startRun(db, 'live');
  for (const [email, status] of [
    ['a@example.com', 'sent'],
    ['b@example.com', 'sent'],
    ['c@example.com', 'failed'],
    ['d@example.com', 'unknown'],
  ]) {
    await claim(db, live, email);
    await record(db, live, email, status, status === 'sent' ? 'ses' : null);
  }
  await db.exec(`
    insert into public.email_bounce_complaints (email_hash, event_type, bounce_type) values
      ('${hash('a@example.com')}', 'bounce', 'hard'),
      ('${hash('b@example.com').slice(0, 16)}', 'complaint', null);
  `);
  const { rows } = await asService(
    db,
    'select * from private.policy_notice_health($1, $2)',
    [NOTICE, V1]
  );
  // The owner preview counts as one more attempt.
  assert.deepEqual(rows[0], {
    attempted: 5,
    rejected: 1,
    unknown: 1,
    hard_bounces: 1,
    complaints: 1,
  });
});

test('the ledger stores ids, statuses, timestamps and the SES id only', async () => {
  const db = await setup();
  const { rows } = await db.query(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'private' and table_name like 'policy_notice_%'
      order by table_name, ordinal_position`
  );
  const columns = (table) =>
    rows.filter((r) => r.table_name === table).map((r) => r.column_name);
  assert.deepEqual(columns('policy_notice_deliveries'), [
    'notice_id',
    'notice_version',
    'recipient_hash',
    'run_id',
    'mode',
    'status',
    'suppression',
    'ses_message_id',
    'created_at',
    'updated_at',
  ]);
  for (const forbidden of ['email', 'html', 'text', 'body', 'subject']) {
    assert.equal(
      rows.some((r) => r.column_name.includes(forbidden)),
      false,
      forbidden
    );
  }
});

test('only service_role can reach the ledger', async () => {
  const db = await setup();
  const { rows } = await db.query(`
    select c.relname, c.relrowsecurity,
      has_table_privilege('anon', c.oid, 'select') as anon_select,
      has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as auth_any,
      has_table_privilege('service_role', c.oid, 'select') as service_select
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname like 'policy_notice_%' and c.relkind = 'r'
    order by c.relname`);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.deepEqual(
      [row.relrowsecurity, row.anon_select, row.auth_any, row.service_select],
      [true, false, false, true],
      row.relname
    );
  }
  const fns = await db.query(`
    select p.proname,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as auth,
      has_function_privilege('public', p.oid, 'execute') as pub,
      p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'policy_notice_%'`);
  assert.ok(fns.rows.length >= 8);
  for (const fn of fns.rows) {
    assert.deepEqual(
      [fn.anon, fn.auth, fn.pub],
      [false, false, false],
      fn.proname
    );
    assert.deepEqual(
      fn.proconfig,
      ['search_path=pg_catalog, pg_temp'],
      fn.proname
    );
  }
  await db.exec('set role authenticated');
  await assert.rejects(
    db.query('select * from private.policy_notice_counts($1, $2, true, true)', [
      NOTICE,
      V1,
    ]),
    /permission denied/
  );
  await db.exec('reset role');
});

test('the static rollback refuses while ledger rows exist, then drops everything', async () => {
  const db = await setup();
  const rollback = await read(`rollbacks/${MIGRATION}.rollback.sql`);
  const statements = rollback.replace(/--.*$/gm, '');
  assert.doesNotMatch(statements, /\bDO\b|\bEXECUTE\b/i);

  const dry = await startRun(db, 'dry_run');
  await finishRun(db, dry, 'completed', {
    eligible: 0,
    suppressed: 0,
    already_sent: 0,
  });
  await assert.rejects(db.exec(rollback), /export them before dropping/);
  await db.exec('rollback');
  const still = await db.query(
    "select to_regclass('private.policy_notice_runs') as t"
  );
  assert.equal(still.rows[0].t, 'private.policy_notice_runs');

  await db.exec(
    'delete from private.policy_notice_deliveries; delete from private.policy_notice_runs;'
  );
  await db.exec(rollback);
  const gone = await db.query(`
    select
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname like 'policy_notice_%') as fns,
      to_regclass('private.policy_notice_runs') as runs,
      to_regclass('private.policy_notice_deliveries') as deliveries`);
  assert.deepEqual(gone.rows[0], { fns: 0, runs: null, deliveries: null });
});
