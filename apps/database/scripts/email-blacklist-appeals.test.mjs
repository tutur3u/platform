import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ws,
  actor,
  otherWs,
  guest,
  recipient,
  email,
  hash,
  binding,
  providerGeneration,
  row,
  result,
  fixture,
  seed,
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
} from './email-blacklist-appeals-fixture.mjs';

test('admin initiation has no email effect; recipient confirmation consumes one workspace grant', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    const tokenClaims = await claims(db, appeal.id);
    assert.equal(
      await result(
        db,
        'SELECT private.email_appeal_claims_match(a,$2) result FROM private.email_blacklist_appeals a WHERE id=$1',
        [appeal.id, tokenClaims]
      ),
      true
    );
    assert.equal(
      await result(
        db,
        'SELECT private.email_appeal_claims_match(a,$2) result FROM private.email_blacklist_appeals a WHERE id=$1',
        [appeal.id, { ...tokenClaims, expiresAt: tokenClaims.expiresAt + 1 }]
      ),
      false
    );
    assert.equal(appeal.status, 'waiting_recipient');
    assert.equal((await claim(db, appeal.id)).status, 'invalid');
    assert.equal(await blocked(db), true);
    await send(db, appeal.id);
    assert.equal(
      (await preview(db, appeal.id)).workspace_name,
      'Trusted workspace'
    );
    assert.equal(
      (await preview(db, appeal.id, { wsId: otherWs })).status,
      'invalid'
    );
    assert.equal(
      (
        await confirm(db, appeal.id, {
          recipientHash: hash('foreign@example.com'),
        })
      ).status,
      'invalid'
    );
    assert.equal((await confirm(db, appeal.id)).status, 'confirmed');
    assert.equal((await confirm(db, appeal.id)).status, 'invalid');
    assert.equal(await blocked(db), false);
    assert.equal(await blocked(db, otherWs), true);
    const grant = await result(
      db,
      'SELECT public.email_appeal_report_grant($1,$2) result',
      [ws, email]
    );
    assert.equal(grant.appeal_id, appeal.id);
    await db.exec(
      'UPDATE private.email_appeal_transport_control SET report_policy_approved=false'
    );
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_report_grant($1,$2) result',
        [ws, email]
      ),
      null
    );
    await db.exec("UPDATE public.workspace_secrets SET value='false'");
    assert.equal(await blocked(db), true);
    assert.equal(
      (await db.query('SELECT count(*)::integer n FROM public.email_blacklist'))
        .rows[0].n,
      1
    );
    assert.equal((await row(db, appeal.id)).recipient_id, recipient);
  } finally {
    await db.close();
  }
});

test('bootstrap requires exact confirmed current identity, explicit claims and is one use', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    const before = await row(db, appeal.id);
    await assert.rejects(
      bootstrap(db, appeal.id, guest),
      /email_appeal_forbidden/
    );
    await db.query(
      'UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1',
      [recipient]
    );
    await assert.rejects(bootstrap(db, appeal.id), /email_appeal_forbidden/);
    await db.query(
      'UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id=$1',
      [recipient]
    );
    assert.equal(
      (await bootstrap(db, appeal.id, undefined, { wsId: otherWs })).status,
      'invalid'
    );
    const view = await result(
      db,
      'SELECT public.email_appeal_recipient_view($1,$2) result',
      [appeal.id, recipient]
    );
    assert.equal(view.email, email);
    await assert.rejects(
      result(db, 'SELECT public.email_appeal_recipient_view($1,$2) result', [
        appeal.id,
        guest,
      ]),
      /email_appeal_forbidden/
    );
    assert.equal((await bootstrap(db, appeal.id)).status, 'verifying');
    assert.equal((await bootstrap(db, appeal.id)).status, 'invalid');
    const after = await row(db, appeal.id);
    assert.equal(String(after.expires_at), String(before.expires_at));
    assert.equal(String(after.cooldown_until), String(before.cooldown_until));
    assert.equal(String(after.created_at), String(before.created_at));
    assert.notEqual(after.token_hash, before.token_hash);
    await assert.rejects(request(db, email, 'retry'), /email_appeal_cooldown/);
  } finally {
    await db.close();
  }
});

test('complaint confirmation requires the verified recipient bootstrap', async () => {
  const db = await fixture();
  try {
    await seed(db, email, 'ses_complaint');
    const appeal = await request(db);
    assert.equal((await confirm(db, appeal.id)).status, 'invalid');
    await assert.rejects(mark(db, appeal.id), /email_appeal_delivery_state/);
    await send(db, appeal.id);
    assert.equal((await confirm(db, appeal.id)).status, 'confirmed');
    assert.equal(await blocked(db), false);
    await db.query(
      "INSERT INTO private.email_bounce_complaints(email_hash,event_type) VALUES ($1,'complaint')",
      [hash(email).slice(0, 16)]
    );
    assert.equal(await blocked(db), true);
    assert.equal((await row(db, appeal.id)).status, 'reblocked');
  } finally {
    await db.close();
  }
});

test('expiry and unknown results cannot mint another token or resend', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await send(db, appeal.id, 'unknown');
    const unknown = await row(db, appeal.id);
    assert.equal((await bootstrap(db, appeal.id)).status, 'invalid');
    assert.equal((await claim(db, appeal.id)).status, 'invalid');
    assert.equal((await confirm(db, appeal.id)).status, 'invalid');
    assert.equal((await row(db, appeal.id)).token_hash, unknown.token_hash);
    await assert.rejects(request(db, email, 'retry'), /email_appeal_cooldown/);
    await db.query(
      "UPDATE private.email_blacklist_appeals SET cooldown_until=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [appeal.id]
    );
    await assert.rejects(
      request(db, email, 'new-key-after-unknown'),
      /email_appeal_cooldown/
    );
    await seed(db, 'expired@example.com');
    const expired = await request(db, 'expired@example.com', 'expired');
    await db.query(
      "UPDATE private.email_blacklist_appeals SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [expired.id]
    );
    const expiredList = await result(
      db,
      'SELECT public.email_appeal_list($1,$2,$3) result',
      [ws, actor, 'expired@example.com']
    );
    assert.equal(expiredList.entries[0].status, 'expired');
    assert.equal((await bootstrap(db, expired.id)).status, 'expired');
    assert.equal((await claim(db, expired.id)).status, 'expired');
  } finally {
    await db.close();
  }
});

test('dispatch is bounded, bound to provider generation and killed by fresh events/config changes', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const appeal = await request(db);
    await bootstrap(db, appeal.id);
    assert.equal((await claim(db, appeal.id)).status, 'dispatching');
    const args = [
      appeal.id,
      ws,
      email,
      (await claims(db, appeal.id)).generation,
      providerGeneration,
      binding,
      (await row(db, appeal.id)).dispatch_id,
    ];
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_authorize_dispatch($1,$2,$3,$4,$5,$6,$7) result',
        args
      ),
      true
    );
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_authorize_dispatch($1,$2,$3,$4,$5,$6,$7) result',
        [...args.slice(0, 4), hash('new-provider-state'), ...args.slice(5)]
      ),
      false
    );
    await db.exec(
      'UPDATE private.email_appeal_transport_control SET enabled=false'
    );
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_authorize_dispatch($1,$2,$3,$4,$5,$6,$7) result',
        args
      ),
      false
    );
    await db.exec(
      'UPDATE private.email_appeal_transport_control SET enabled=true'
    );
    await db.query(
      "INSERT INTO private.email_bounce_complaints(email_hash,event_type) VALUES ($1,'complaint')",
      [hash(email).slice(0, 16)]
    );
    assert.equal(
      await result(
        db,
        'SELECT public.email_appeal_authorize_dispatch($1,$2,$3,$4,$5,$6,$7) result',
        args
      ),
      false
    );
    assert.equal((await mark(db, appeal.id)).status, 'reblocked');
  } finally {
    await db.close();
  }
});

test('authenticated mapped feedback deduplicates and escalates re-block cooldown', async () => {
  const db = await fixture();
  try {
    await seed(db);
    const first = await request(db);
    await send(db, first.id);
    await confirm(db, first.id);
    for (const overrides of [
      { accountId: 'wrong' },
      { region: 'wrong' },
      { address: 'other@example.com' },
      { workspace: otherWs },
      { messageId: 'wrong' },
    ])
      assert.equal((await feedback(db, first.id, overrides)).status, 'invalid');
    assert.equal((await feedback(db, first.id)).status, 'recorded');
    assert.equal((await feedback(db, first.id)).status, 'duplicate');
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::integer n FROM private.email_bounce_complaints'
        )
      ).rows[0].n,
      1
    );
    assert.equal(await blocked(db), true);
    await db.exec(
      "UPDATE private.email_blacklist_appeals SET cooldown_until=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '8 days'"
    );
    const second = await request(db, email, 'second');
    await send(db, second.id);
    await confirm(db, second.id);
    assert.equal(
      (
        await feedback(db, second.id, {
          eventId: 'event-two',
          type: 'complaint',
          bounceType: null,
        })
      ).status,
      'recorded'
    );
    const hours = (
      await db.query(
        'SELECT extract(epoch FROM cooldown_until-clock_timestamp())/3600 hours FROM private.email_blacklist_appeals WHERE id=$1',
        [second.id]
      )
    ).rows[0].hours;
    assert.ok(Number(hours) > 95);
  } finally {
    await db.close();
  }
});
