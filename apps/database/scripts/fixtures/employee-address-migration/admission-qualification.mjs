import assert from 'node:assert/strict';

const key = "hashtextextended('employee-address-reservations',0)";
const tables = [
  'auth.users',
  'auth.identities',
  'public.users',
  'public.user_private_details',
  'public.workspace_members',
  'public.workspaces',
  'public.workspace_default_permissions',
  'public.workspace_roles',
  'public.workspace_role_members',
  'public.workspace_role_permissions',
  'public.platform_user_roles',
  'public.platform_email_roles',
  'private.mail_domains',
  'private.mail_mailboxes',
  'private.mail_mailbox_members',
  'private.infrastructure_employees',
  'private.employee_creation_intents',
  'private.employee_creation_operations',
  'private.employee_restore_operations',
  'private.employee_address_migrations',
];
const snapshot = `select jsonb_build_object(${tables
  .map(
    (table) =>
      `'${table}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${table} t)`
  )
  .join(',')})::text;`;

export async function qualifyAdmission({
  test,
  session,
  sql,
  rpc,
  waitBlocked,
  binding,
  reserve,
  json,
  providerEmail,
  user,
  other,
  attempt,
  source,
}) {
  await test('blocking exclusive admission control queues an unrelated shared writer', async () => {
    const holder = session('admission_holder');
    const exclusive = session('exclusive_control');
    const unrelated = session('shared_control');
    let exclusivePending, unrelatedPending;
    try {
      await holder.send(`begin; set local statement_timeout='6s';
        update private.mail_mailboxes set address=address where address='${source}'`);
      await exclusive.send(`set application_name='exclusive_control'; begin;
        set local statement_timeout='6s'`);
      exclusivePending = exclusive.send(`select pg_advisory_xact_lock(${key})`);
      exclusivePending.catch(() => {});
      await waitBlocked('exclusive_control', 'advisory');
      await unrelated.send(`set application_name='shared_control'; begin;
        set local statement_timeout='6s'`);
      unrelatedPending = unrelated.send(
        `update auth.users set email=email where id='${other}'`
      );
      unrelatedPending.catch(() => {});
      await waitBlocked('shared_control', 'advisory');
      await holder.send('rollback');
      await exclusivePending;
      await exclusive.send('rollback');
      await unrelatedPending;
      await unrelated.send('rollback');
    } finally {
      holder.close();
      exclusive.close();
      unrelated.close();
      await Promise.allSettled(
        [exclusivePending, unrelatedPending].filter(Boolean)
      );
    }
  });
  for (const action of ['inspect', 'reserve', 'claim', 'complete']) {
    await test(`${action} rejects busy admission without convoy, capability or state change`, async () => {
      const bound =
        action === 'inspect' || action === 'reserve'
          ? await binding()
          : await reserve();
      if (action === 'complete') {
        await json(rpc('claim', bound, attempt));
        await providerEmail(true);
      }
      const before = await sql(snapshot);
      const holder = session(`holder_${action}`);
      try {
        await holder.send(`begin; set local statement_timeout='6s';
          update private.mail_mailboxes set address=address where address='${source}'`);
        await assert.rejects(
          sql(`\\set VERBOSITY verbose
          begin; set local statement_timeout='2s';
          select ${rpc(action, bound, action === 'claim' ? attempt : null)}; commit;`),
          /55P03.*Address migration admission busy/s
        );
        assert.equal(
          await sql(`select count(*) from pg_locks where locktype='advisory'
          and mode='ExclusiveLock' and not granted
          and (classid::bigint * 4294967296 + objid::bigint)::numeric =
            (${key}::numeric + 18446744073709551616) % 18446744073709551616
          and objsubid=1;`),
          '0'
        );
        assert.equal(
          await sql(`begin; set local statement_timeout='2s';
          update auth.users set email=email where id='${other}' returning id; rollback;`),
          other
        );
        await holder.send(
          `update auth.users set email=email where id='${user}'; rollback`
        );
      } finally {
        holder.close();
      }
      assert.equal(await sql(snapshot), before);
    });
  }
}
