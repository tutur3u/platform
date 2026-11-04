// Admin resend of failed, stuck or approved-unsent periodic reports. Runs the
// shipped delivery functions and the audit migrations against a synthetic
// in-memory PGlite schema: no real database, queue or email provider, and
// nothing can send. Proves that private.request_periodic_report_resend
// re-checks the confirmed state under the row lock: a report in flight, sent,
// with an unknown outcome or skipped is never queued again, a stuck queue row
// is re-requested exactly once, and a refusal changes nothing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function canonical(migration, start, end = '$$;') {
  const source = await read(`supabase/migrations/${migration}`);
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`${start} not found in ${migration}`);
  return source.slice(from, to + end.length);
}

const WS = '00000000-0000-4000-8000-00000000d001';
const SUBJECT = '00000000-0000-4000-8000-00000000d002';
const CLASS = '00000000-0000-4000-8000-00000000d003';
const REPORT = '00000000-0000-4000-8000-00000000d101';
const ACTOR = '00000000-0000-4000-8000-00000000d901';
const HELD_MIGRATION = '20261104120000_periodic_report_held_actions.sql';
const RESEND_MIGRATION = '20261104121500_periodic_report_resend_action.sql';
const UNKNOWN =
  'Email delivery outcome is unknown. Check provider logs before retrying.';

async function setup() {
  const db = new PGlite();
  await db.exec(await read('scripts/fixtures/periodic-report-held-schema.sql'));
  for (const table of [
    'create table if not exists private.user_report_email_queue',
    'create table if not exists private.user_report_email_attempts',
  ])
    await db.exec(
      await canonical(
        '20260723172309_first_class_periodic_reports.sql',
        table,
        ');'
      )
    );
  await db.exec(
    await canonical(
      '20261007040000_periodic_report_unknown_outcomes.sql',
      'create or replace function private.request_periodic_report_delivery('
    )
  );
  await db.exec(
    await canonical(
      '20260911100000_periodic_report_approval_delivery.sql',
      'create or replace function private.claim_periodic_report_emails('
    )
  );
  await db.exec(
    await canonical(
      RESEND_MIGRATION,
      'create or replace function private.request_periodic_report_resend('
    )
  );
  await db.exec(`
    insert into public.users (id) values ('${ACTOR}');
    insert into public.workspaces (id, name) values ('${WS}', 'Synthetic');
    insert into public.workspace_users (id, ws_id, email)
      values ('${SUBJECT}', '${WS}', 'learner@example.com');
    insert into public.workspace_user_groups (id, ws_id) values ('${CLASS}', '${WS}');
    insert into private.external_user_monthly_reports
      (id, user_id, group_id, title, report_approval_status, approved_at)
      values ('${REPORT}', '${SUBJECT}', '${CLASS}', 'September', 'APPROVED', now());
  `);
  return db;
}

const one = async (db, sql) => (await db.query(sql)).rows[0];
const resend = async (db, expected) =>
  (
    await one(
      db,
      `select private.request_periodic_report_resend('${REPORT}', '${WS}', '${expected}', true) as r`
    )
  ).r.code;
const request = async (db, action) =>
  (
    await one(
      db,
      `select private.request_periodic_report_delivery('${REPORT}', '${WS}', '${action}', true) as r`
    )
  ).r.code;
const state = (db) =>
  one(
    db,
    `select r.delivery_status as report, q.status as queue,
       (select count(*)::int from private.user_report_email_queue where report_id = r.id) as rows
     from private.external_user_monthly_reports r
     left join private.user_report_email_queue q on q.report_id = r.id
     where r.id = '${REPORT}'`
  );
const claim = (db) =>
  db.query(
    `select * from private.claim_periodic_report_emails('synthetic-worker', 10, now())`
  );

const ageQueue = (db, minutes) =>
  db.exec(`update private.user_report_email_queue
    set next_attempt_at = now() - interval '${minutes} minutes';
    update private.external_user_monthly_reports
    set delivery_requested_at = now() - interval '${minutes} minutes'`);

test('a stuck queued report is re-requested once, never twice', async () => {
  const db = await setup();
  try {
    assert.equal(await request(db, 'send'), 200);
    await ageQueue(db, 30);
    assert.equal(await resend(db, 'queued'), 409, 'not stuck yet');
    await ageQueue(db, 120);
    assert.equal(await resend(db, 'queued'), 200);
    assert.deepEqual(await state(db), {
      report: 'queued',
      queue: 'queued',
      rows: 1,
    });
    // Just re-requested: a second resend of the same row is refused.
    assert.equal(await resend(db, 'queued'), 409);
    assert.equal((await state(db)).rows, 1);
  } finally {
    await db.close();
  }
});

test('a report in flight is never resent: a claimed row is refused', async () => {
  const db = await setup();
  try {
    assert.equal(await request(db, 'send'), 200);
    await ageQueue(db, 120);
    assert.equal(
      (await claim(db)).rows.length,
      1,
      'the worker takes the lease'
    );
    for (const expected of ['queued', 'failed', 'draft', 'blocked'])
      assert.equal(await resend(db, expected), 409, expected);
    assert.deepEqual(await state(db), {
      report: 'processing',
      queue: 'processing',
      rows: 1,
    });
  } finally {
    await db.close();
  }
});

test('a sent report or one with an unknown outcome is never queued again', async () => {
  const db = await setup();
  try {
    assert.equal(await request(db, 'send'), 200);
    await db.exec(`update private.user_report_email_queue
      set status = 'blocked', last_error = '${UNKNOWN}', locked_at = null;
      update private.external_user_monthly_reports
      set delivery_status = 'blocked', last_delivery_error = '${UNKNOWN}'`);
    assert.equal(await resend(db, 'blocked'), 409, 'unknown outcome');

    await db.exec(`update private.user_report_email_queue
      set status = 'failed', last_error = 'Provider accepted the email, but delivery tracking failed. Check provider logs before retrying.',
        provider_message_id = 'synthetic-message';
      update private.external_user_monthly_reports
      set delivery_status = 'failed', last_delivery_error = 'Provider accepted the email, but delivery tracking failed. Check provider logs before retrying.'`);
    assert.equal(await resend(db, 'failed'), 409, 'provider accepted');

    await db.exec(`update private.user_report_email_queue
      set status = 'sent', last_error = null, sent_at = now();
      update private.external_user_monthly_reports
      set delivery_status = 'sent', delivered_at = now(), last_delivery_error = null`);
    assert.equal(await resend(db, 'failed'), 409, 'sent');
    assert.equal((await state(db)).queue, 'sent');
  } finally {
    await db.close();
  }
});

test('a failed or approved-unsent report is resent once; a skipped one never', async () => {
  const db = await setup();
  try {
    assert.equal(await resend(db, 'draft'), 200, 'approved, never sent');
    assert.equal(await resend(db, 'draft'), 409, 'no longer draft');
    await db.exec(`update private.user_report_email_queue
      set status = 'failed', last_error = 'Email provider rejected the delivery.',
        next_attempt_at = now() + interval '1 hour';
      update private.external_user_monthly_reports
      set delivery_status = 'failed', last_delivery_error = 'Email provider rejected the delivery.'`);
    assert.equal(await resend(db, 'failed'), 200);
    assert.deepEqual(await state(db), {
      report: 'queued',
      queue: 'queued',
      rows: 1,
    });
    assert.equal(await resend(db, 'failed'), 409);

    // Skipped by an admin after the count: the confirmed state is gone.
    await db.exec(`update private.user_report_email_queue set status = 'cancelled';
      update private.external_user_monthly_reports set delivery_status = 'skipped'`);
    for (const expected of ['draft', 'failed', 'queued', 'blocked'])
      assert.equal(await resend(db, expected), 409, expected);
    assert.equal((await state(db)).report, 'skipped');
  } finally {
    await db.close();
  }
});

test('a refused resend changes nothing, including the stuck-row cancel', async () => {
  const db = await setup();
  try {
    assert.equal(await request(db, 'send'), 200);
    await ageQueue(db, 120);
    // The delivery pipeline refuses (missing email) after the cancel.
    await db.exec(`update public.workspace_users set email = null`);
    assert.equal(await resend(db, 'queued'), 409);
    assert.deepEqual(await state(db), {
      report: 'queued',
      queue: 'queued',
      rows: 1,
    });
    // Another workspace cannot resend it, and a bad state is rejected.
    await db.exec(
      `update public.workspace_users set email = 'learner@example.com'`
    );
    const other = '00000000-0000-4000-8000-00000000e001';
    await db.exec(
      `insert into public.workspaces (id, name) values ('${other}', 'Other')`
    );
    assert.equal(
      (
        await one(
          db,
          `select private.request_periodic_report_resend('${REPORT}', '${other}', 'queued', true) as r`
        )
      ).r.code,
      404
    );
    assert.equal(await resend(db, 'sent'), 400);
    assert.equal(await resend(db, 'skipped'), 400);
  } finally {
    await db.close();
  }
});

test('held Send now and Skip refuse a report with a recorded delivery error', async () => {
  const db = await setup();
  try {
    await db.exec(await read(`supabase/migrations/${HELD_MIGRATION}`));
    await db.exec(await read(`supabase/migrations/${RESEND_MIGRATION}`));
    await db.exec(`update private.external_user_monthly_reports
      set last_delivery_error = 'Email provider rejected the delivery.'`);
    assert.equal(
      (
        await one(
          db,
          `select private.request_held_periodic_report_delivery('${REPORT}', '${WS}', true) as r`
        )
      ).r.code,
      409
    );
    assert.deepEqual(
      (
        await one(
          db,
          `select private.skip_held_periodic_reports('${WS}', array['${REPORT}']::uuid[]) as r`
        )
      ).r,
      []
    );
    await db.exec(
      `update private.external_user_monthly_reports set last_delivery_error = ' '`
    );
    assert.equal(
      (
        await one(
          db,
          `select private.request_held_periodic_report_delivery('${REPORT}', '${WS}', true) as r`
        )
      ).r.code,
      200,
      'a blank error is no error'
    );
  } finally {
    await db.close();
  }
});

test('the audit accepts a resend of a selection and keeps the held rules', async () => {
  const db = await setup();
  try {
    await db.exec(await read(`supabase/migrations/${HELD_MIGRATION}`));
    const table = 'private.periodic_report_held_actions';
    const insert = (key, action, scope) =>
      db.exec(`insert into ${table}
        (ws_id, actor_user_id, action, cadence, period_start, period_end, group_id, idempotency_key, requested_count)
        values ('${WS}', '${ACTOR}', '${action}', ${scope}, '${key}', 2)`);
    const selection = 'null, null, null, null';
    const key = (n) => `00000000-0000-4000-8000-00000000f0${n}`;

    // Before this migration, resend is refused: the route answers 503.
    await assert.rejects(
      insert(key('01'), 'resend', selection),
      /periodic_report_held_actions_action_check|cadence/
    );

    const migration = await read(`supabase/migrations/${RESEND_MIGRATION}`);
    assert.match(migration, /^BEGIN;$/m);
    assert.match(migration, /^SET LOCAL lock_timeout = '5s';$/m);
    assert.match(migration, /^SET LOCAL statement_timeout = '60s';$/m);
    assert.doesNotMatch(
      migration.replace(/--.*$/gm, '').replace(/\$\$[\s\S]*?\$\$/g, ''),
      /\b(insert|update|delete|truncate)\b/i,
      'outside function bodies, the migration changes no rows'
    );
    await db.exec(migration);

    await insert(key('02'), 'resend', selection);
    await insert(
      key('03'),
      'resend',
      `'monthly', '2026-09-01', '2026-09-30', null`
    );
    await assert.rejects(
      insert(key('04'), 'send', selection),
      /periodic_report_held_actions_(scope_check|cadence_required)/
    );
    await assert.rejects(
      insert(key('05'), 'send', `null, null, null, '${CLASS}'`),
      /periodic_report_held_actions_cadence_required/
    );
    await assert.rejects(
      insert(key('06'), 'resend-all', selection),
      /periodic_report_held_actions_action_check/
    );
    await assert.rejects(
      insert(key('02'), 'resend', selection),
      /periodic_report_held_actions_idempotency_key/
    );
    await insert(key('07'), 'skip', `'monthly', null, null, '${CLASS}'`);

    // Rollback refuses while resend rows exist, then restores the old rules.
    const rollback = await read(
      'rollbacks/20261104121500_periodic_report_resend_action.rollback.sql'
    );
    await assert.rejects(db.exec(rollback), /resend audit rows exist/);
    await db.exec('rollback');
    await db.exec(`delete from ${table} where action = 'resend'`);
    await db.exec(rollback);
    await assert.rejects(
      insert(key('08'), 'resend', selection),
      /periodic_report_held_actions_action_check|cadence/
    );
    assert.equal(
      (await one(db, `select count(*)::int as n from ${table}`)).n,
      1,
      'the held choices survive the rollback'
    );
    assert.equal(
      (
        await one(
          db,
          `select to_regprocedure('private.request_periodic_report_resend(uuid,uuid,text,boolean)') as f`
        )
      ).f,
      null,
      'the rollback drops the resend function'
    );
  } finally {
    await db.close();
  }
});
