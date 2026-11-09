import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  fixture,
  seed,
  request,
  bootstrap,
  claim,
  feedback,
  row,
  mark,
  send,
  confirm,
  blocked,
  result,
  claims,
  ws,
  email,
  hash,
  reportBinding,
  providerGeneration,
} from './email-blacklist-appeals-fixture.mjs';

test('authenticated feedback before the confirmation response mark is durable', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await bootstrap(db, appeal.id);
    await claim(db, appeal.id);
    assert.equal((await row(db, appeal.id)).provider_message_id, null);
    assert.equal((await feedback(db, appeal.id)).status, 'recorded');
    assert.equal((await row(db, appeal.id)).status, 'reblocked');
    assert.equal((await mark(db, appeal.id)).status, 'reblocked');
    assert.equal(
      (await row(db, appeal.id)).provider_message_id,
      `message-${appeal.id}`
    );
  } finally {
    await db.close();
  }
});

async function reportDispatch(db, appealId) {
  const subject = (
    await db.query(
      'SELECT id FROM public.workspace_users WHERE ws_id=$1 AND email=$2',
      [ws, email]
    )
  ).rows[0].id;
  const reportId = randomUUID();
  const queueId = randomUUID();
  await db.query(
    "INSERT INTO private.external_user_monthly_reports VALUES ($1,$2,'APPROVED')",
    [reportId, subject]
  );
  await db.query(
    "INSERT INTO private.user_report_email_queue(id,report_id,ws_id,user_id,recipient_email,status,locked_at,locked_by) VALUES ($1,$2,$3,$4,$5,'processing',clock_timestamp(),'feedback-worker')",
    [queueId, reportId, ws, subject, email]
  );
  return result(
    db,
    'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
    [
      appealId,
      ws,
      email,
      queueId,
      (await claims(db, appealId)).generation,
      reportBinding,
      hash('report'),
      providerGeneration,
    ]
  );
}

async function reportRow(db, id) {
  return (
    await db.query(
      'SELECT * FROM private.email_appeal_report_dispatches WHERE id=$1',
      [id]
    )
  ).rows[0];
}

for (const kind of ['confirmation', 'report']) {
  for (const timing of ['before-mark', 'unknown', 'unknown-after-stop']) {
    for (const type of ['bounce', 'complaint']) {
      test(`${kind} ${type} feedback survives ${timing} without replay or consent revival`, async () => {
        const db = await fixture();
        try {
          await seed(db);
          const appeal = await request(db);
          let dispatch;
          if (kind === 'report') {
            await send(db, appeal.id);
            await confirm(db, appeal.id);
            dispatch = await reportDispatch(db, appeal.id);
            assert.equal(dispatch.status, 'dispatching');
          } else {
            await bootstrap(db, appeal.id);
            dispatch = await claim(db, appeal.id);
          }
          const messageId =
            kind === 'report' ? 'early-report-message' : `message-${appeal.id}`;
          if (timing !== 'before-mark') {
            if (kind === 'report')
              await result(
                db,
                "SELECT public.email_appeal_mark_report($1,'unknown') result",
                [dispatch.id]
              );
            else await mark(db, appeal.id, 'unknown');
          }
          if (timing === 'unknown-after-stop') {
            await db.exec(
              'UPDATE private.email_appeal_transport_control SET enabled=false,provider_policy_approved=false,report_policy_approved=false,binding=NULL,report_binding=NULL'
            );
            const historical = await result(
              db,
              'SELECT public.email_appeal_feedback_bindings() result'
            );
            assert.ok(
              historical.some(
                (value) =>
                  value.configuration_set ===
                  (kind === 'report'
                    ? reportBinding.configuration_set
                    : 'appeal-confirmation')
              )
            );
          }
          const overrides = {
            type,
            bounceType: type === 'complaint' ? null : 'hard',
            messageId,
            ...(kind === 'report'
              ? {
                  dispatchId: dispatch.id,
                  dispatchKind: kind,
                  identity: reportBinding.identity,
                  configurationSet: reportBinding.configuration_set,
                }
              : {}),
          };
          assert.equal(
            (
              await feedback(db, appeal.id, {
                ...overrides,
                dispatchId: randomUUID(),
              })
            ).status,
            'invalid'
          );
          assert.equal(
            (
              await feedback(db, appeal.id, {
                ...overrides,
                address: 'unrelated@example.com',
              })
            ).status,
            'invalid'
          );
          assert.equal(
            (await feedback(db, appeal.id, overrides)).status,
            'recorded'
          );
          assert.equal(
            (await feedback(db, appeal.id, overrides)).status,
            'duplicate'
          );
          const persisted = (
            await db.query('SELECT * FROM private.email_appeal_feedback')
          ).rows;
          assert.equal(persisted.length, 1);
          assert.equal(persisted[0].message_id, messageId);
          assert.equal(persisted[0].dispatch_kind, kind);
          assert.equal(
            (await db.query('SELECT * FROM private.email_bounce_complaints'))
              .rows.length,
            1
          );
          if (kind === 'report') {
            const saved = await reportRow(db, dispatch.id);
            assert.equal(saved.provider_message_id, messageId);
            assert.equal(
              saved.status,
              timing === 'before-mark' ? 'dispatching' : 'unknown'
            );
            assert.equal((await row(db, appeal.id)).status, 'reblocked');
            assert.equal(
              await result(
                db,
                'SELECT public.email_appeal_report_grant($1,$2) result',
                [ws, email]
              ),
              null
            );
            if (timing === 'before-mark') {
              await result(
                db,
                "SELECT public.email_appeal_mark_report($1,'sent',$2) result",
                [dispatch.id, messageId]
              );
              assert.equal((await row(db, appeal.id)).status, 'reblocked');
            } else {
              await assert.rejects(
                result(
                  db,
                  "SELECT public.email_appeal_mark_report($1,'sent',$2) result",
                  [dispatch.id, messageId]
                ),
                /email_appeal_delivery_state/
              );
              assert.equal(
                (await reportRow(db, dispatch.id)).status,
                'unknown'
              );
            }
          } else {
            assert.equal(
              (await row(db, appeal.id)).status,
              timing === 'before-mark' ? 'reblocked' : 'unknown'
            );
            if (timing === 'before-mark')
              assert.equal((await mark(db, appeal.id)).status, 'reblocked');
            else
              await assert.rejects(
                mark(db, appeal.id),
                /email_appeal_delivery_state/
              );
            assert.equal((await confirm(db, appeal.id)).status, 'invalid');
          }
          assert.equal(await blocked(db), true);
          assert.equal(
            (
              await feedback(db, appeal.id, {
                ...overrides,
                eventId: 'unrelated-event',
                messageId: 'different-message',
              })
            ).status,
            'invalid'
          );
          assert.equal(
            (await db.query('SELECT * FROM private.email_bounce_complaints'))
              .rows.length,
            1
          );
        } finally {
          await db.close();
        }
      });
    }
  }
}

test('pre-response feedback requires every stored dispatch binding and an actual dispatch claim', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    assert.equal(
      (await feedback(db, appeal.id, { dispatchId: randomUUID() })).status,
      'invalid'
    );
    await bootstrap(db, appeal.id);
    await claim(db, appeal.id);
    for (const mismatch of [
      { accountId: '999999999999' },
      { region: 'us-east-1' },
      { workspace: randomUUID() },
      { identity: 'other@example.com' },
      { configurationSet: 'other-set' },
      { dispatchKind: 'report' },
      { dispatchId: null },
    ])
      assert.equal((await feedback(db, appeal.id, mismatch)).status, 'invalid');
    assert.equal(
      (await db.query('SELECT * FROM private.email_appeal_feedback')).rows
        .length,
      0
    );
    assert.equal((await row(db, appeal.id)).provider_message_id, null);
    assert.equal((await feedback(db, appeal.id)).status, 'recorded');
    await assert.rejects(
      result(
        db,
        "SELECT public.email_appeal_mark_delivery($1,'sent','different-response-message') result",
        [appeal.id]
      ),
      /email_appeal_delivery_state/
    );
    assert.equal((await row(db, appeal.id)).status, 'reblocked');
  } finally {
    await db.close();
  }
});

test('an UNKNOWN response following early feedback retains the original terminal operation', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await bootstrap(db, appeal.id);
    const dispatch = await claim(db, appeal.id);
    await feedback(db, appeal.id);
    assert.equal((await mark(db, appeal.id, 'unknown')).status, 'unknown');
    assert.equal((await row(db, appeal.id)).dispatch_id, dispatch.dispatch_id);
    assert.equal(
      (await row(db, appeal.id)).provider_message_id,
      `message-${appeal.id}`
    );
    assert.equal((await bootstrap(db, appeal.id)).status, 'invalid');
    assert.equal((await claim(db, appeal.id)).status, 'invalid');
    await assert.rejects(mark(db, appeal.id), /email_appeal_delivery_state/);
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET created_at=clock_timestamp()-interval '8 days',cooldown_until=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()-interval '1 second'"
    );
    await assert.rejects(
      request(db, email, 'replacement'),
      /email_appeal_cooldown/
    );
  } finally {
    await db.close();
  }
});

test('feedback correlation remains inaccessible to client roles', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await bootstrap(db, appeal.id);
    await claim(db, appeal.id);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(
        result(
          db,
          'SELECT public.email_appeal_feedback($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result',
          [
            'event',
            'message',
            '222222222222',
            'ap-southeast-1',
            email,
            ws,
            'complaint',
            null,
            appeal.id,
            randomUUID(),
            'confirmation',
            'verify@example.com',
            'appeal-confirmation',
          ]
        ),
        /permission denied/
      );
      await assert.rejects(
        db.query('SELECT * FROM private.email_appeal_feedback'),
        /permission denied/
      );
      await db.exec('RESET ROLE');
    }
  } finally {
    await db.close();
  }
});
