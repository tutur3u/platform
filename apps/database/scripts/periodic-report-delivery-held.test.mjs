// Held periodic reports (approved, never requested for delivery) must stay
// held through every automatic path: enabling auto-send, deploying, applying
// migrations and cron worker runs. Runs the real delivery functions from the
// migrations against a synthetic in-memory PGlite schema. No real database,
// queue or email provider is involved; nothing can send.
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
const HELD = '00000000-0000-4000-8000-00000000d101';
const FRESH = '00000000-0000-4000-8000-00000000d102';
const ACTOR = '00000000-0000-4000-8000-00000000d901';
const HELD_MIGRATION = '20261104120000_periodic_report_held_actions.sql';

async function setup() {
  const db = new PGlite();
  await db.exec(await read('scripts/fixtures/periodic-report-held-schema.sql'));
  await db.exec(
    await canonical(
      '20260723172309_first_class_periodic_reports.sql',
      'create table if not exists private.user_report_email_queue',
      ');'
    )
  );
  await db.exec(
    await canonical(
      '20260723172309_first_class_periodic_reports.sql',
      'create table if not exists private.user_report_email_attempts',
      ');'
    )
  );
  // Current definitions of the stage, approval trigger, manual request and
  // worker claim, exactly as the migrations ship them.
  await db.exec(
    await canonical(
      '20260912110000_periodic_report_stages.sql',
      'create or replace function private.periodic_report_stage'
    )
  );
  await db.exec(
    await canonical(
      '20261007040000_periodic_report_unknown_outcomes.sql',
      'create or replace function private.queue_approved_periodic_report()'
    )
  );
  await db.exec(
    await canonical(
      '20260911100000_periodic_report_approval_delivery.sql',
      'create trigger queue_approved_periodic_report',
      'private.queue_approved_periodic_report();'
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
  await db.exec(`
    insert into public.users (id) values ('${ACTOR}');
    insert into public.workspaces (id, name) values ('${WS}', 'Synthetic');
    insert into public.workspace_users (id, ws_id, email)
      values ('${SUBJECT}', '${WS}', 'learner@example.com');
    insert into public.workspace_user_groups (id, ws_id) values ('${CLASS}', '${WS}');
  `);
  return db;
}

const one = async (db, sql) => (await db.query(sql)).rows[0];
const queueCount = async (db) =>
  Number(
    (
      await one(
        db,
        'select count(*)::int as n from private.user_report_email_queue'
      )
    ).n
  );
const snapshot = async (db, id) =>
  one(
    db,
    `select delivery_status, delivery_requested_at, last_delivery_error,
       private.periodic_report_stage(generation_status, report_approval_status, delivery_status) as stage
     from private.external_user_monthly_reports where id = '${id}'`
  );
const claim = async (db) =>
  (
    await db.query(
      `select * from private.claim_periodic_report_emails('synthetic-worker', 50, now() + interval '1 day')`
    )
  ).rows;

async function approveWhileAutoSendOff(db) {
  await db.exec(`
    insert into private.external_user_monthly_reports
      (id, user_id, group_id, title, period_start, period_end)
      values ('${HELD}', '${SUBJECT}', '${CLASS}', 'September', '2026-09-01', '2026-09-30');
    update private.external_user_monthly_reports
      set report_approval_status = 'APPROVED', approved_at = now() where id = '${HELD}';
  `);
}

test('held reports stay held through auto-send, migrations and cron runs', async () => {
  const db = await setup();
  try {
    await approveWhileAutoSendOff(db);
    const held = await snapshot(db, HELD);
    assert.deepEqual(
      { status: held.delivery_status, stage: held.stage },
      { status: 'draft', stage: 'approved' },
      'approval with auto-send off leaves the report held'
    );
    assert.equal(await queueCount(db), 0);

    // 1. Turning auto-send on.
    await db.exec(`insert into public.workspace_configs (ws_id, id, value)
      values ('${WS}', 'AUTO_SEND_APPROVED_REPORTS', 'true')`);
    await db.exec(`update public.workspace_configs set value = 'false'
      where ws_id = '${WS}' and id = 'AUTO_SEND_APPROVED_REPORTS'`);
    await db.exec(`update public.workspace_configs set value = 'true', updated_at = now()
      where ws_id = '${WS}' and id = 'AUTO_SEND_APPROVED_REPORTS'`);
    assert.equal(
      await queueCount(db),
      0,
      'enabling auto-send does not backfill'
    );

    // 2. Edits, re-saves and a repeated approve-all on an approved report.
    await db.exec(`
      update private.external_user_monthly_reports set title = 'September (edited)', updated_at = now() where id = '${HELD}';
      update private.external_user_monthly_reports set report_approval_status = 'APPROVED', approved_at = now() where id = '${HELD}';
    `);
    assert.equal(
      await queueCount(db),
      0,
      'touching a held report does not enqueue it'
    );

    // 3. Deploying this change: its migration is inert.
    await db.exec(await read(`supabase/migrations/${HELD_MIGRATION}`));
    assert.equal(await queueCount(db), 0, 'the migration enqueues nothing');
    assert.deepEqual(await snapshot(db, HELD), await snapshot(db, HELD));
    assert.equal((await snapshot(db, HELD)).delivery_status, 'draft');

    // 4. Scheduled worker runs.
    for (let run = 0; run < 3; run++)
      assert.deepEqual(
        await claim(db),
        [],
        'cron claims nothing for held reports'
      );
    const after = await snapshot(db, HELD);
    assert.equal(after.delivery_status, 'draft');
    assert.equal(after.stage, 'approved');
    assert.equal(after.delivery_requested_at, null);

    // Control: the trigger is live, so the assertions above are meaningful.
    await db.exec(`
      insert into private.external_user_monthly_reports (id, user_id, group_id, title)
        values ('${FRESH}', '${SUBJECT}', '${CLASS}', 'October');
      update private.external_user_monthly_reports
        set report_approval_status = 'APPROVED', approved_at = now() where id = '${FRESH}';
    `);
    assert.equal(
      await queueCount(db),
      1,
      'a new approval with auto-send on queues'
    );
    const claimed = await claim(db);
    assert.deepEqual(
      claimed.map((row) => row.report_id),
      [FRESH],
      'the worker claims only the explicitly queued report'
    );
    assert.equal((await snapshot(db, HELD)).delivery_status, 'draft');
  } finally {
    await db.close();
  }
});

test('Skip leaves a held report not sent, and nothing automatic revives it', async () => {
  const db = await setup();
  try {
    await approveWhileAutoSendOff(db);
    // The held route's skip write, re-checked against the held state.
    await db.exec(`update private.external_user_monthly_reports
      set delivery_status = 'skipped'
      where id = '${HELD}' and delivery_status = 'draft'
        and report_approval_status = 'APPROVED' and delivered_at is null`);
    const skipped = await snapshot(db, HELD);
    assert.deepEqual(
      { status: skipped.delivery_status, stage: skipped.stage },
      { status: 'skipped', stage: 'skipped' }
    );
    await db.exec(`insert into public.workspace_configs (ws_id, id, value)
      values ('${WS}', 'AUTO_SEND_APPROVED_REPORTS', 'true')`);
    await db.exec(`update private.external_user_monthly_reports
      set report_approval_status = 'APPROVED', approved_at = now() where id = '${HELD}'`);
    assert.deepEqual(await claim(db), []);
    assert.equal(
      await queueCount(db),
      0,
      'a skipped report is never queued automatically'
    );
    assert.equal((await snapshot(db, HELD)).delivery_status, 'skipped');
  } finally {
    await db.close();
  }
});

test('Send now uses the existing request pipeline and cannot double-queue', async () => {
  const db = await setup();
  try {
    await approveWhileAutoSendOff(db);
    const request = `select private.request_periodic_report_delivery('${HELD}', '${WS}', 'send', true) as r`;
    assert.equal((await one(db, request)).r.code, 200);
    assert.equal((await snapshot(db, HELD)).delivery_status, 'queued');
    assert.equal(
      (await one(db, request)).r.code,
      409,
      're-request is rejected'
    );
    assert.equal(await queueCount(db), 1);
    const other = '00000000-0000-4000-8000-00000000e001';
    await db.exec(
      `insert into public.workspaces (id, name) values ('${other}', 'Other')`
    );
    assert.equal(
      (
        await one(
          db,
          `select private.request_periodic_report_delivery('${HELD}', '${other}', 'send', true) as r`
        )
      ).r.code,
      404,
      'another workspace cannot request this report'
    );
  } finally {
    await db.close();
  }
});

test('held action audit is service-role only, scoped and idempotent', async () => {
  const db = await setup();
  try {
    await db.exec(await read(`supabase/migrations/${HELD_MIGRATION}`));
    const table = 'private.periodic_report_held_actions';
    assert.equal(
      (
        await one(
          db,
          `select relrowsecurity from pg_class where oid = '${table}'::regclass`
        )
      ).relrowsecurity,
      true
    );
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['select', 'insert', 'update', 'delete']) {
        assert.equal(
          (
            await one(
              db,
              `select has_table_privilege('${role}', '${table}', '${privilege}') as ok`
            )
          ).ok,
          false,
          `${role} has no ${privilege}`
        );
      }
    }
    for (const privilege of ['select', 'insert', 'update'])
      assert.equal(
        (
          await one(
            db,
            `select has_table_privilege('service_role', '${table}', '${privilege}') as ok`
          )
        ).ok,
        true
      );
    assert.equal(
      (
        await one(
          db,
          `select has_table_privilege('service_role', '${table}', 'delete') as ok`
        )
      ).ok,
      false,
      'audit rows cannot be deleted through the service role'
    );
    const insert = (key, scope = `'2026-09-01', '2026-09-30', null`) =>
      db.exec(`insert into ${table}
        (ws_id, actor_user_id, action, cadence, period_start, period_end, group_id, idempotency_key, requested_count)
        values ('${WS}', '${ACTOR}', 'skip', 'monthly', ${scope}, '${key}', 2)`);
    const key = '00000000-0000-4000-8000-00000000f001';
    await insert(key);
    await assert.rejects(
      insert(key),
      /periodic_report_held_actions_idempotency_key/
    );
    await assert.rejects(
      insert('00000000-0000-4000-8000-00000000f002', 'null, null, null'),
      /periodic_report_held_actions_scope_check/
    );
    await insert(
      '00000000-0000-4000-8000-00000000f003',
      `null, null, '${CLASS}'`
    );

    // Rollback refuses to drop recorded choices, then removes the table.
    const rollback = await read(
      'rollbacks/20261104120000_periodic_report_held_actions.rollback.sql'
    );
    await assert.rejects(db.exec(rollback), /audit rows exist/);
    await db.exec('rollback');
    await db.exec(`delete from ${table}`);
    await db.exec(rollback);
    assert.equal(
      (await one(db, `select to_regclass('${table}') as t`)).t,
      null
    );
  } finally {
    await db.close();
  }
});
