import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const baseline = process.argv.includes('--baseline');
const db = new PGlite();
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let assertions = 0;
let failures = 0;
async function check(name, sql, expected) {
  const { rows } = await db.query(sql);
  assertions += 1;
  try {
    assert.deepEqual(rows[0]?.value, expected);
    console.log(`ok ${assertions} - ${name}`);
  } catch {
    failures += 1;
    console.log(`not ok ${assertions} - ${name}`);
  }
}
const insertNotification = (
  id,
  user = 1,
  message = 10,
  mailbox = 20,
  type = 'mail_received'
) =>
  `insert into public.notifications(id,user_id,entity_id,entity_type,scope,type,data)
   values('${uid(id)}','${uid(user)}','${uid(message)}','mail_message','user','${type}',
   jsonb_build_object('mailboxId','${uid(mailbox)}','messageId','${uid(message)}','userId','${uid(user)}'));`;
try {
  // Isolated synthetic schema: real migration executes against these tables.
  // No network, provider transport, credentials, production data or RLS proof.
  await db.exec(`create schema private;
    create role anon; create role authenticated; create role service_role;
    create table private.mail_message_user_state (
      message_id uuid, user_id uuid, mailbox_id uuid, read_at timestamptz, archived_at timestamptz, trashed_at timestamptz,
      primary key(message_id,user_id));
    create table public.notifications (
      id uuid primary key, user_id uuid, entity_id uuid, entity_type text,
      scope text, ws_id uuid, type text, data jsonb, read_at timestamptz);
    insert into private.mail_message_user_state(message_id,user_id,mailbox_id,read_at) values
      ('${uid(10)}','${uid(1)}','${uid(20)}','2026-01-01T00:00:00Z');
    ${insertNotification(100)}
    ${insertNotification(101, 2)}
    ${insertNotification(102, 1, 10, 21)}
    ${insertNotification(103, 1, 10, 20, 'workspace_invite')}`);
  if (!baseline) {
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261119003000_reconcile_mail_notification_reads.sql',
          import.meta.url
        ),
        'utf8'
      )
    );
  }
  if (baseline)
    await db.exec(
      'alter table private.mail_message_user_state add column notification_consumed_at timestamptz'
    );
  for (const [index, action] of [
    'archived_at',
    'trashed_at',
    'notification_consumed_at',
  ].entries()) {
    const message = 40 + index;
    await db.exec(`insert into private.mail_message_user_state(message_id,user_id,mailbox_id,${action})
      values('${uid(message)}','${uid(1)}','${uid(20)}',now());
      ${insertNotification(200 + index, 1, message)}
      ${insertNotification(210 + index, 2, message)}
      update private.mail_message_user_state set archived_at=null, trashed_at=null,read_at=null where message_id='${uid(message)}';`);
    await check(
      `${action} late insert consumed after restore`,
      `select read_at is not null as value from notifications where id='${uid(200 + index)}'`,
      true
    );
    await check(
      `${action} actor isolation`,
      `select read_at is null as value from notifications where id='${uid(210 + index)}'`,
      true
    );
    await check(
      `${action} preserves Mail unread`,
      `select read_at is null as value from private.mail_message_user_state where message_id='${uid(message)}'`,
      true
    );
  }
  await check(
    'historical read mail notification is reconciled',
    `select read_at is not null as value from public.notifications where id='${uid(100)}'`,
    true
  );
  await db.exec(`update private.mail_message_user_state set read_at=null where message_id='${uid(10)}';
    ${insertNotification(109)}`);
  await check(
    'clearing historical read preserves consumption for a late alert',
    `select read_at is not null as value from notifications where id='${uid(109)}'`,
    true
  );
  for (const id of [101, 102, 103])
    await check(
      'other user, mismatched mailbox and unrelated type stay unread',
      `select read_at is null as value from public.notifications where id='${uid(id)}'`,
      true
    );
  await db.exec(insertNotification(104, 1, 11));
  await db.exec(`insert into private.mail_message_user_state(message_id,user_id,mailbox_id,read_at) values('${uid(11)}','${uid(1)}','${uid(20)}',null);
    update private.mail_message_user_state set read_at='2026-02-01T00:00:00Z' where message_id='${uid(11)}';`);
  await check(
    'opening or marking an existing message read archives its notification',
    `select read_at is not null as value from public.notifications where id='${uid(104)}'`,
    true
  );
  await db.exec(insertNotification(105, 1, 12));
  await db.exec(
    `insert into private.mail_message_user_state(message_id,user_id,mailbox_id,read_at) values('${uid(12)}','${uid(1)}','${uid(20)}',now());`
  );
  await check(
    'first read-state upsert archives its notification',
    `select read_at is not null as value from public.notifications where id='${uid(105)}'`,
    true
  );
  await db.exec(insertNotification(106, 1, 11));
  await check(
    'late notification insertion respects already-read mail',
    `select read_at is not null as value from public.notifications where id='${uid(106)}'`,
    true
  );
  await db.exec(insertNotification(107, 1, 13));
  await check(
    'another unread message in the same mailbox stays unread',
    `select read_at is null as value from public.notifications where id='${uid(107)}'`,
    true
  );
  await db.exec(
    `update private.mail_message_user_state set read_at=null where message_id='${uid(11)}';`
  );
  await check(
    'marking mail unread does not resurrect an archived alert',
    `select read_at is not null as value from public.notifications where id='${uid(104)}'`,
    true
  );
  await db.exec(insertNotification(108, 1, 14));
  await db.exec(`update public.notifications set read_at='2025-01-01T00:00:00Z' where id='${uid(108)}';
    insert into private.mail_message_user_state(message_id,user_id,mailbox_id,read_at) values('${uid(14)}','${uid(1)}','${uid(20)}',now());`);
  await check(
    'an existing notification read timestamp is preserved',
    `select read_at='2025-01-01T00:00:00Z'::timestamptz as value from public.notifications where id='${uid(108)}'`,
    true
  );
  if (!baseline) {
    for (const name of [
      'reconcile_mail_read_notifications',
      'apply_mail_read_state_to_notification',
      'stamp_mail_notification_consumption',
    ])
      await check(
        'browser roles cannot execute trigger authority',
        `select not has_function_privilege('authenticated','private.${name}()','execute') and not has_function_privilege('anon','private.${name}()','execute') as value`,
        true
      );
  }
  if (!baseline) {
    await db.exec(`create table private.mail_mailbox_members(mailbox_id uuid,user_id uuid,role text);
      create table private.mail_labels(id uuid,mailbox_id uuid,kind text,slug text);
      create table private.mail_messages(id uuid,mailbox_id uuid,direction text);
      create table private.mail_message_labels(message_id uuid,label_id uuid,
        primary key(message_id,label_id), check(message_id <> '${uid(61)}'));
      insert into private.mail_mailbox_members values('${uid(20)}','${uid(1)}','owner'),
        ('${uid(20)}','${uid(2)}','viewer');
      insert into private.mail_labels values('${uid(30)}','${uid(20)}','system','blocked');
      insert into private.mail_messages values('${uid(60)}','${uid(20)}','inbound'),
        ('${uid(61)}','${uid(20)}','inbound'),('${uid(62)}','${uid(21)}','inbound');
      ${insertNotification(260, 1, 60)} ${insertNotification(261, 2, 60)}
      ${insertNotification(262, 1, 61)}`);
    const move = (
      message,
      actor = 1
    ) => `select private.move_mail_to_blocked_and_consume_notifications(
      '${uid(20)}','${uid(actor)}','${uid(30)}',array['${uid(message)}']::uuid[])`;
    await db.exec(move(60));
    await check(
      'atomic move consumes actor alert',
      `select read_at is not null as value from notifications where id='${uid(260)}'`,
      true
    );
    await check(
      'atomic move preserves another member alert',
      `select read_at is null as value from notifications where id='${uid(261)}'`,
      true
    );
    await check(
      'atomic move preserves message unread',
      `select read_at is null as value from private.mail_message_user_state where message_id='${uid(60)}'`,
      true
    );
    for (const [message, actor] of [
      [61, 1],
      [62, 1],
      [60, 2],
    ]) {
      await assert.rejects(() => db.exec(move(message, actor)));
      assertions += 1;
      console.log(
        `ok ${assertions} - invalid or failed move rejected (${message}/${actor})`
      );
    }
    await check(
      'failed label write rolls back consumption',
      `select read_at is null as value from notifications where id='${uid(262)}'`,
      true
    );
    await check(
      'failed label write rolls back actor state',
      `select count(*)::int as value from private.mail_message_user_state where message_id='${uid(61)}'`,
      0
    );
    await db.exec(`update private.mail_message_user_state set notification_consumed_at=null where message_id='${uid(60)}';
      ${insertNotification(263, 1, 60)}`);
    await check(
      'consumption marker cannot be cleared to resurrect a late alert',
      `select read_at is not null as value from notifications where id='${uid(263)}'`,
      true
    );
    await check(
      'browser roles cannot execute atomic movement authority',
      `select not has_function_privilege('authenticated','private.move_mail_to_blocked_and_consume_notifications(uuid,uuid,uuid,uuid[])','execute') and not has_function_privilege('anon','private.move_mail_to_blocked_and_consume_notifications(uuid,uuid,uuid,uuid[])','execute') as value`,
      true
    );
  }
  console.log(
    JSON.stringify({
      baseline,
      assertions,
      failures,
      schema: 'synthetic',
      migration: 'real',
      productionWrites: 0,
    })
  );
  if (failures) process.exitCode = 1;
} finally {
  await db.close();
}
