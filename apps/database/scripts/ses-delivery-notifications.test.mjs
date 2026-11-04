// SES bounce and complaint notifications: the real migrations (policy notice
// ledger, then the notification recorder) and the static rollback, run
// against a synthetic in-memory PGlite schema. Fixture addresses only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const LEDGER = '20261104180000_policy_notice_send_ledger';
const MIGRATION = '20261104183000_ses_delivery_notifications';
const TOPIC = 'arn:aws:sns:ap-southeast-1:123456789012:ses-events';
const ACTOR = '00000000-0000-4000-8000-0000000000aa';
const RUN = '00000000-0000-4000-8000-0000000000bb';

const hash16 = (email) =>
  createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
const hash64 = (email) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

async function setup() {
  const db = new PGlite();
  await db.exec(await read('scripts/fixtures/policy-notice-ledger-schema.sql'));
  // The real email_blacklist keys and address format, as in production.
  await db.exec(`
    alter table public.email_blacklist
      add constraint email_blacklist_type_value_unique unique (entry_type, value),
      add constraint email_blacklist_email_format_check check (
        entry_type != 'email' or value ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$'
      );
    alter table private.email_bounce_complaints
      add column bounce_subtype text,
      add column complaint_type text,
      add column raw_notification jsonb;
    grant insert on public.email_blacklist to service_role;
  `);
  await db.exec(await read(`supabase/migrations/${LEDGER}.sql`));
  await db.exec(await read(`supabase/migrations/${MIGRATION}.sql`));
  await db.query('insert into auth.users (id) values ($1)', [ACTOR]);
  // One live notice run with two sent deliveries.
  await db.query(
    `insert into private.policy_notice_runs (id, notice_id, notice_version, mode, started_by)
     values ($1, 'policy-change-2026-11-11', 'v4-aaaaaaaaaaaa', 'live', $2)`,
    [RUN, ACTOR]
  );
  for (const [email, id] of [
    ['bounced@example.com', 'ses-bounce'],
    ['complained@example.com', 'ses-complaint'],
    ['transient@example.com', 'ses-transient'],
  ]) {
    await db.query(
      `insert into private.policy_notice_deliveries
         (notice_id, notice_version, recipient_hash, run_id, mode, status, ses_message_id)
       values ('policy-change-2026-11-11', 'v4-aaaaaaaaaaaa', $1, $2, 'live', 'sent', $3)`,
      [hash64(email), RUN, id]
    );
  }
  return db;
}

async function recordNotification(db, input) {
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query(
      `select private.record_ses_notification($1, $2, $3, $4, $5, $6, $7) as result`,
      [
        input.snsMessageId,
        TOPIC,
        input.kind,
        input.bounceType ?? null,
        input.detail ?? null,
        input.sesMessageId ?? null,
        input.recipients,
      ]
    );
    return rows[0].result;
  } finally {
    await db.exec('reset role');
  }
}

const blacklist = async (db) =>
  (
    await db.query(
      'select value, reason from public.email_blacklist order by value'
    )
  ).rows;
const events = async (db) =>
  (
    await db.query(
      `select email_hash, event_type, bounce_type, raw_notification
         from private.email_bounce_complaints order by email_hash`
    )
  ).rows;
const ledgerStatus = async (db, sesMessageId) =>
  (
    await db.query(
      'select status from private.policy_notice_deliveries where ses_message_id = $1',
      [sesMessageId]
    )
  ).rows[0]?.status;

test('a permanent bounce adds a suppression row, records the bounce and marks the ledger', async () => {
  const db = await setup();
  const result = await recordNotification(db, {
    snsMessageId: 'sns-1',
    kind: 'bounce',
    bounceType: 'Permanent',
    detail: 'General',
    sesMessageId: 'ses-bounce',
    recipients: ['Bounced@Example.com'],
  });

  assert.equal(result, 'recorded');
  assert.deepEqual(await blacklist(db), [
    { value: 'bounced@example.com', reason: 'ses_hard_bounce' },
  ]);
  assert.deepEqual(await events(db), [
    {
      email_hash: hash16('bounced@example.com'),
      event_type: 'bounce',
      bounce_type: 'hard',
      raw_notification: null,
    },
  ]);
  assert.equal(await ledgerStatus(db, 'ses-bounce'), 'bounced');
});

test('a complaint adds a suppression row and marks the ledger complained', async () => {
  const db = await setup();
  assert.equal(
    await recordNotification(db, {
      snsMessageId: 'sns-2',
      kind: 'complaint',
      detail: 'abuse',
      sesMessageId: 'ses-complaint',
      recipients: ['complained@example.com'],
    }),
    'recorded'
  );
  assert.deepEqual(await blacklist(db), [
    { value: 'complained@example.com', reason: 'ses_complaint' },
  ]);
  assert.equal((await events(db))[0].event_type, 'complaint');
  assert.equal(await ledgerStatus(db, 'ses-complaint'), 'complained');
});

test('a transient bounce is recorded but suppresses nothing and leaves the ledger', async () => {
  const db = await setup();
  await recordNotification(db, {
    snsMessageId: 'sns-3',
    kind: 'bounce',
    bounceType: 'Transient',
    detail: 'MailboxFull',
    sesMessageId: 'ses-transient',
    recipients: ['transient@example.com'],
  });
  assert.deepEqual(await blacklist(db), []);
  assert.equal((await events(db))[0].bounce_type, 'transient');
  assert.equal(await ledgerStatus(db, 'ses-transient'), 'sent');
});

test('a duplicate SNS MessageId is a no-op', async () => {
  const db = await setup();
  const input = {
    snsMessageId: 'sns-4',
    kind: 'bounce',
    bounceType: 'Permanent',
    sesMessageId: 'ses-bounce',
    recipients: ['bounced@example.com'],
  };
  assert.equal(await recordNotification(db, input), 'recorded');
  await db.exec(
    "update private.policy_notice_deliveries set status = 'sent' where ses_message_id = 'ses-bounce'"
  );
  assert.equal(await recordNotification(db, input), 'duplicate');
  assert.equal((await events(db)).length, 1);
  assert.equal(await ledgerStatus(db, 'ses-bounce'), 'sent');
});

test('an existing suppression is kept and an unusable address is skipped', async () => {
  const db = await setup();
  await db.exec(
    "insert into public.email_blacklist (entry_type, value, reason) values ('email', 'bounced@example.com', 'recipient_unsubscribed')"
  );
  await recordNotification(db, {
    snsMessageId: 'sns-5',
    kind: 'bounce',
    bounceType: 'Permanent',
    recipients: ['bounced@example.com', 'not-an-address', 'x@nodot'],
  });
  assert.deepEqual(await blacklist(db), [
    { value: 'bounced@example.com', reason: 'recipient_unsubscribed' },
  ]);
  // The hard bounce is still on record, so senders that read bounces see it.
  assert.equal(
    (await events(db)).filter((e) => e.bounce_type === 'hard').length,
    3
  );
});

test('a complaint after a bounce upgrades the ledger row; a bounce never downgrades it', async () => {
  const db = await setup();
  await recordNotification(db, {
    snsMessageId: 'sns-6',
    kind: 'bounce',
    bounceType: 'Permanent',
    sesMessageId: 'ses-bounce',
    recipients: ['bounced@example.com'],
  });
  await recordNotification(db, {
    snsMessageId: 'sns-7',
    kind: 'complaint',
    sesMessageId: 'ses-bounce',
    recipients: ['bounced@example.com'],
  });
  await recordNotification(db, {
    snsMessageId: 'sns-8',
    kind: 'bounce',
    bounceType: 'Permanent',
    sesMessageId: 'ses-bounce',
    recipients: ['bounced@example.com'],
  });
  assert.equal(await ledgerStatus(db, 'ses-bounce'), 'complained');
});

test('the notice health counts ledger rows marked from notifications', async () => {
  const db = await setup();
  await recordNotification(db, {
    snsMessageId: 'sns-9',
    kind: 'bounce',
    bounceType: 'Permanent',
    sesMessageId: 'ses-bounce',
    recipients: ['bounced@example.com'],
  });
  await recordNotification(db, {
    snsMessageId: 'sns-10',
    kind: 'complaint',
    sesMessageId: 'ses-complaint',
    recipients: ['complained@example.com'],
  });
  await db.exec('set role service_role');
  const { rows } = await db.query(
    "select * from private.policy_notice_health('policy-change-2026-11-11', 'v4-aaaaaaaaaaaa')"
  );
  await db.exec('reset role');
  assert.deepEqual(rows[0], {
    attempted: 3,
    rejected: 0,
    unknown: 0,
    hard_bounces: 1,
    complaints: 1,
  });
});

test('invalid input is refused', async () => {
  const db = await setup();
  await assert.rejects(
    recordNotification(db, {
      snsMessageId: 'sns-11',
      kind: 'delivery',
      recipients: ['a@example.com'],
    }),
    /invalid_kind/
  );
  await assert.rejects(
    recordNotification(db, {
      snsMessageId: 'sns-12',
      kind: 'bounce',
      bounceType: 'Weird',
      recipients: ['a@example.com'],
    }),
    /invalid_bounce_type/
  );
  await assert.rejects(
    recordNotification(db, {
      snsMessageId: 'sns-13',
      kind: 'bounce',
      bounceType: 'Permanent',
      recipients: Array.from({ length: 51 }, (_, i) => `r${i}@example.com`),
    }),
    /invalid_recipients/
  );
});

test('only service_role can record notifications or read receipts', async () => {
  const db = await setup();
  const { rows } = await db.query(`
    select
      has_table_privilege('anon', 'private.ses_notification_receipts', 'select') as anon,
      has_table_privilege('authenticated', 'private.ses_notification_receipts', 'select,insert') as auth,
      has_table_privilege('service_role', 'private.ses_notification_receipts', 'select,insert') as service,
      (select relrowsecurity from pg_class where oid = 'private.ses_notification_receipts'::regclass) as rls,
      has_function_privilege('anon', 'private.record_ses_notification(text,text,text,text,text,text,text[])', 'execute') as fn_anon,
      has_function_privilege('authenticated', 'private.record_ses_notification(text,text,text,text,text,text,text[])', 'execute') as fn_auth,
      (select proconfig from pg_proc where proname = 'record_ses_notification') as config`);
  assert.deepEqual(rows[0], {
    anon: false,
    auth: false,
    service: true,
    rls: true,
    fn_anon: false,
    fn_auth: false,
    config: ['search_path=pg_catalog, pg_temp'],
  });
  const columns = (
    await db.query(
      `select column_name from information_schema.columns
        where table_schema = 'private' and table_name = 'ses_notification_receipts'
        order by ordinal_position`
    )
  ).rows.map((r) => r.column_name);
  assert.deepEqual(columns, [
    'sns_message_id',
    'topic_arn',
    'kind',
    'received_at',
  ]);
});

test('the static rollback refuses while receipts exist, then drops its objects', async () => {
  const db = await setup();
  const rollback = await read(`rollbacks/${MIGRATION}.rollback.sql`);
  assert.doesNotMatch(rollback.replace(/--.*$/gm, ''), /\bDO\b|\bEXECUTE\b/i);
  await recordNotification(db, {
    snsMessageId: 'sns-14',
    kind: 'complaint',
    recipients: ['a@example.com'],
  });
  await assert.rejects(db.exec(rollback), /export them before dropping/);
  await db.exec('rollback');
  await db.exec('delete from private.ses_notification_receipts');
  await db.exec(rollback);
  const { rows } = await db.query(`
    select to_regclass('private.ses_notification_receipts') as receipts,
      (select count(*)::int from pg_proc where proname = 'record_ses_notification') as fns,
      to_regclass('private.policy_notice_deliveries') as ledger`);
  assert.deepEqual(rows[0], {
    receipts: null,
    fns: 0,
    ledger: 'private.policy_notice_deliveries',
  });
});
