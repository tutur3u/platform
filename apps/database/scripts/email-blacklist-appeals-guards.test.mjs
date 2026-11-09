import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  migration,
  rollback,
  ws,
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
  send,
  confirm,
  blocked,
  feedback,
} from './email-blacklist-appeals-fixture.mjs';

test('workspace/address budgets and global verification/transport budgets remain durable', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 10; i++) {
      await seed(db, `recipient${i}@example.com`);
      await request(db, `recipient${i}@example.com`, `token${i}`);
    }
    await seed(db, email);
    await assert.rejects(request(db), /email_appeal_workspace_limit/);
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET created_at=clock_timestamp()-interval '2 days',cooldown_until=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()-interval '1 second'"
    );
    const appeal = await request(db);
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()-interval '1 second'"
    );
    await request(db, email, 'second');
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()-interval '1 second'"
    );
    await request(db, email, 'third');
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()-interval '1 second'"
    );
    await assert.rejects(
      request(db, email, 'fourth'),
      /email_appeal_address_limit/
    );
    await db.query(
      "INSERT INTO private.email_blacklist_appeals(ws_id,actor_id,email,email_hash,reason,suppression,token_hash,verification_started_at,dispatched_at,status) SELECT $1,$2,'cap'||g||'@example.com','caphash','Synthetic cap fixture',$3,md5(g::text)||md5(g::text),clock_timestamp(),clock_timestamp(),'unknown' FROM generate_series(1,20) g",
      [ws, actor, (await row(db, appeal.id)).suppression]
    );
    await seed(db, 'capacity@example.com');
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET created_at=clock_timestamp()-interval '2 days'"
    );
    const cap = await request(db, 'capacity@example.com', 'cap');
    assert.equal((await bootstrap(db, cap.id)).status, 'unavailable');
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET verification_started_at=NULL WHERE status='unknown'"
    );
    await seed(db, 'dispatch-cap@example.com');
    const dispatch = await request(
      db,
      'dispatch-cap@example.com',
      'dispatch-cap'
    );
    assert.equal((await bootstrap(db, dispatch.id)).status, 'verifying');
    assert.equal((await claim(db, dispatch.id)).status, 'unavailable');
  } finally {
    await db.close();
  }
});

test('provider-only inventory is workspace scoped, bounded and stale inventory cannot dispatch', async () => {
  const db = await fixture();
  try {
    await db.query(
      'INSERT INTO public.workspace_users(ws_id,email) VALUES ($1,$2)',
      [ws, email]
    );
    await providerStatus(db, email, { suppressed: true, reason: 'COMPLAINT' });
    const page = await result(
      db,
      'SELECT public.email_appeal_list($1,$2,$3,$4,$5) result',
      [ws, actor, '', 0, 25]
    );
    assert.equal(page.entries[0].reason, 'ses_complaint');
    assert.equal(page.total, 1);
    await assert.rejects(
      providerStatus(db, 'foreign@example.com', {
        suppressed: true,
        reason: 'BOUNCE',
      }),
      /email_appeal_recipient/
    );
    const appeal = await request(db);
    await bootstrap(db, appeal.id);
    await db.exec(
      "UPDATE private.email_appeal_provider_status SET checked_at=clock_timestamp()-interval '11 minutes'"
    );
    assert.equal((await claim(db, appeal.id)).status, 'unavailable');
    for (let i = 0; i < 100; i++)
      await result(
        db,
        'SELECT public.email_appeal_recipient_candidates($1,$2,$3,$4,$5) result',
        [ws, actor, '', 0, 1]
      );
    await assert.rejects(
      result(
        db,
        'SELECT public.email_appeal_recipient_candidates($1,$2,$3,$4,$5) result',
        [ws, actor, '', 0, 1]
      ),
      /email_appeal_inventory_limit/
    );
    await db.exec(
      'UPDATE private.email_appeal_transport_control SET enabled=false'
    );
    await assert.rejects(
      result(
        db,
        'SELECT public.email_appeal_recipient_candidates($1,$2,$3,$4,$5) result',
        [ws, actor, '', 0, 1]
      ),
      /email_appeal_unavailable/
    );
  } finally {
    await db.close();
  }
});

test('protected bans, admin permissions, table ACLs and empty rollback stay enforced', async () => {
  const db = await fixture();
  try {
    await seed(db);
    await assert.rejects(
      request(db, email, 'guest', ws, guest),
      /email_appeal_forbidden/
    );
    await assert.rejects(
      request(db, 'foreign@example.com', 'foreign'),
      /email_appeal_recipient/
    );
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
      request(db, email, 'domain'),
      /email_appeal_not_appealable/
    );
    await db.exec('SET ROLE authenticated');
    await assert.rejects(
      result(db, 'SELECT public.email_appeal_confirm($1,$2) result', [
        hash('token'),
        {},
      ]),
      /permission denied/
    );
    await assert.rejects(
      result(
        db,
        'SELECT public.email_appeal_claim_bootstrap($1,$2,$3,$4) result',
        [randomUUID(), recipient, hash('token'), {}]
      ),
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

test('report sends require exact active consent, reviewed report binding and current approved queue lease', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await send(db, appeal.id);
    await confirm(db, appeal.id);
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
      "INSERT INTO private.user_report_email_queue(id,report_id,ws_id,user_id,recipient_email,status,locked_at,locked_by) VALUES ($1,$2,$3,$4,$5,'processing',clock_timestamp(),'worker-one')",
      [queueId, reportId, ws, subject, email]
    );
    const args = [
      appeal.id,
      ws,
      email,
      queueId,
      (await claims(db, appeal.id)).generation,
      reportBinding,
      hash('report content'),
      providerGeneration,
    ];
    assert.equal(
      (
        await result(
          db,
          'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
          [...args.slice(0, 5), binding, ...args.slice(6)]
        )
      ).status,
      'invalid'
    );
    await db.query(
      "UPDATE private.external_user_monthly_reports SET report_approval_status='REJECTED' WHERE id=$1",
      [reportId]
    );
    assert.equal(
      (
        await result(
          db,
          'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
          args
        )
      ).status,
      'invalid'
    );
    await db.query(
      "UPDATE private.external_user_monthly_reports SET report_approval_status='APPROVED' WHERE id=$1",
      [reportId]
    );
    const dispatch = await result(
      db,
      'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
      args
    );
    assert.equal(
      (
        await result(
          db,
          'SELECT public.email_appeal_report_grant($1,$2) result',
          [ws, email]
        )
      ).provider_generation,
      providerGeneration
    );
    assert.equal(dispatch.status, 'dispatching');
    const authorizeArgs = [
      dispatch.id,
      ws,
      email,
      args[4],
      providerGeneration,
      reportBinding,
    ];
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_authorize_report_dispatch($1,$2,$3,$4,$5,$6) result',
        authorizeArgs
      ),
      true
    );
    await db.query(
      "UPDATE private.user_report_email_queue SET locked_by='worker-two' WHERE id=$1",
      [queueId]
    );
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_authorize_report_dispatch($1,$2,$3,$4,$5,$6) result',
        authorizeArgs
      ),
      false
    );
    await result(
      db,
      "SELECT public.email_appeal_mark_report($1,'unknown') result",
      [dispatch.id]
    );
    assert.equal(
      (
        await result(
          db,
          'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
          args
        )
      ).status,
      'invalid'
    );
    const replacementQueue = await db.query(
      "INSERT INTO private.user_report_email_queue(id,report_id,ws_id,user_id,recipient_email,status,locked_at,locked_by) SELECT gen_random_uuid(),report_id,ws_id,user_id,recipient_email,'processing',clock_timestamp(),'replacement-worker' FROM private.user_report_email_queue WHERE id=$1 RETURNING id",
      [queueId]
    );
    const replacementArgs = [...args];
    replacementArgs[3] = replacementQueue.rows[0].id;
    assert.equal(
      (
        await result(
          db,
          'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
          replacementArgs
        )
      ).status,
      'invalid'
    );
    await assert.rejects(
      result(
        db,
        "SELECT public.email_appeal_mark_report($1,'sent','late-message') result",
        [dispatch.id]
      ),
      /email_appeal_delivery_state/
    );
    const status = (
      await result(
        db,
        'SELECT public.email_appeal_block_statuses($1,$2) result',
        [ws, [email]]
      )
    )[0];
    assert.equal(status.has_workspace_grant, true);
  } finally {
    await db.close();
  }
});

test('report feedback binds actual report dispatch and provider generation changes invalidate consent', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await send(db, appeal.id);
    await confirm(db, appeal.id);
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
      "INSERT INTO private.user_report_email_queue(id,report_id,ws_id,user_id,recipient_email,status,locked_at,locked_by) VALUES ($1,$2,$3,$4,$5,'processing',clock_timestamp(),'worker-one')",
      [queueId, reportId, ws, subject, email]
    );
    const dispatch = await result(
      db,
      'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
      [
        appeal.id,
        ws,
        email,
        queueId,
        (await claims(db, appeal.id)).generation,
        reportBinding,
        hash('report'),
        providerGeneration,
      ]
    );
    await result(
      db,
      "SELECT public.email_appeal_mark_report($1,'sent','report-message') result",
      [dispatch.id]
    );
    assert.equal(
      (await feedback(db, appeal.id, { messageId: 'report-message' })).status,
      'recorded'
    );
    assert.equal(await blocked(db), true);
    assert.equal(
      (await feedback(db, appeal.id, { messageId: 'report-message' })).status,
      'duplicate'
    );
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '8 days'"
    );
    const next = await request(db, email, 'next');
    await bootstrap(db, next.id);
    await providerStatus(db, email, {
      suppressed: false,
      provider_generation: hash('new-provider-event-with-same-reason'),
    });
    assert.equal((await row(db, next.id)).status, 'reblocked');
    assert.equal((await claim(db, next.id)).status, 'reblocked');
  } finally {
    await db.close();
  }
});

test('known recipient pagination happens before local/provider suppression filtering', async () => {
  const db = await fixture();
  try {
    await seed(db, 'z-blocked@example.com');
    await db.query(
      'INSERT INTO public.workspace_users(ws_id,email) VALUES ($1,$2)',
      [ws, 'a-clear@example.com']
    );
    const first = await result(
      db,
      'SELECT public.email_appeal_list($1,$2,$3,$4,$5) result',
      [ws, actor, '', 0, 1]
    );
    const second = await result(
      db,
      'SELECT public.email_appeal_list($1,$2,$3,$4,$5) result',
      [ws, actor, '', 1, 1]
    );
    assert.equal(first.total, 2);
    assert.equal(first.entries.length, 0);
    assert.equal(second.entries[0].email, 'z-blocked@example.com');
    const candidates = await result(
      db,
      'SELECT public.email_appeal_recipient_candidates($1,$2,$3,$4,$5) result',
      [ws, actor, '', 1, 1]
    );
    assert.deepEqual(candidates.entries, ['z-blocked@example.com']);
    assert.equal(
      (
        await result(
          db,
          'SELECT public.email_appeal_feedback_bindings() result'
        )
      ).length,
      2
    );
  } finally {
    await db.close();
  }
});

test('sending stop retains historical bindings for authenticated late feedback revocation', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await send(db, appeal.id);
    await confirm(db, appeal.id);
    await db.exec(
      'UPDATE private.email_appeal_transport_control SET enabled=false,provider_policy_approved=false,report_policy_approved=false,binding=NULL,report_binding=NULL'
    );
    assert.equal(
      await result(db, 'SELECT public.email_appeal_transport_binding() result'),
      null
    );
    const historical = await result(
      db,
      'SELECT public.email_appeal_feedback_bindings() result'
    );
    assert.deepEqual(historical, [binding]);
    assert.equal(
      (await feedback(db, appeal.id, { messageId: 'unrecorded-message' }))
        .status,
      'invalid'
    );
    assert.equal(
      (await feedback(db, appeal.id, { type: 'complaint', bounceType: null }))
        .status,
      'recorded'
    );
    assert.equal(await blocked(db), true);
    assert.equal((await row(db, appeal.id)).status, 'reblocked');
    assert.equal(
      (await feedback(db, appeal.id, { type: 'complaint', bounceType: null }))
        .status,
      'duplicate'
    );
  } finally {
    await db.close();
  }
});

test('fresh provider generation cannot replace the generation verified at consent', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await send(db, appeal.id);
    await confirm(db, appeal.id);
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
      "INSERT INTO private.user_report_email_queue(id,report_id,ws_id,user_id,recipient_email,status,locked_at,locked_by) VALUES ($1,$2,$3,$4,$5,'processing',clock_timestamp(),'worker-generation')",
      [queueId, reportId, ws, subject, email]
    );
    const args = [
      appeal.id,
      ws,
      email,
      queueId,
      (await claims(db, appeal.id)).generation,
      reportBinding,
      hash('report content'),
      providerGeneration,
    ];
    assert.equal(
      (
        await result(
          db,
          'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
          [...args.slice(0, 7), hash('new complaint')]
        )
      ).status,
      'invalid'
    );
    const dispatch = await result(
      db,
      'SELECT public.email_appeal_claim_report($1,$2,$3,$4,$5,$6,$7,$8) result',
      args
    );
    assert.equal(dispatch.status, 'dispatching');
    assert.equal(
      (
        await result(
          db,
          "SELECT public.email_appeal_mark_report($1,'reblocked') result",
          [dispatch.id]
        )
      ).status,
      'reblocked'
    );
    assert.equal((await row(db, appeal.id)).status, 'reblocked');
    assert.equal(await blocked(db), true);
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_report_grant($1,$2) result',
        [ws, email]
      ),
      null
    );
  } finally {
    await db.close();
  }
});
