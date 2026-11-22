import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function runManagerPostconditionRaces({
  actors,
  asServiceRole,
  clients,
  creator,
  ordinaryMember,
  waitForBlock,
}) {
  const [leader, follower] = clients;
  const [first, second] = actors;
  const workspace = randomUUID();
  const role = randomUUID();
  const grant = leader.json([
    { id: 'manage_workspace_members', enabled: true },
  ]);

  function depart(sql, member) {
    return sql`select public.remove_workspace_member_guarded_in_mode(
      ${workspace}, ${member}, ${member}, 'workspace'
    ) as result`;
  }

  function remove(sql) {
    return sql`select public.remove_workspace_member_guarded_in_mode(
      ${workspace}, ${first}, ${creator}, 'workspace'
    ) as result`;
  }

  function repair(sql) {
    return sql`select private.update_workspace_role_guarded(
      ${workspace}, ${role}, ${creator}, 'workspace', ${grant}
    ) as result`;
  }

  async function race(label, operationA, operationB, expectedA, expectedB) {
    const [{ pid }] = await follower`select pg_backend_pid() as pid`;
    let pending;
    let finished = false;
    try {
      const [{ result }] = await leader.begin(
        'isolation level read committed',
        async (sql) => {
          await asServiceRole(sql);
          const response = await operationA(sql);
          pending = follower.begin(
            'isolation level read committed',
            async (concurrent) => {
              await asServiceRole(concurrent);
              return operationB(concurrent);
            }
          );
          void pending
            .finally(() => {
              finished = true;
            })
            .catch(() => {});
          await waitForBlock(
            sql,
            pid,
            `${label} did not wait for the advisory lock`,
            () => finished
          );
          return response;
        }
      );
      assert.equal(result, expectedA, label);
      assert.equal((await pending)[0].result, expectedB, label);
      console.log(`ok - ${label}: ${expectedA} and ${expectedB}`);
    } finally {
      if (pending) await Promise.allSettled([pending]);
    }
  }

  function removeRoleMember(sql, member) {
    return sql`select public.remove_workspace_role_member_guarded_in_mode(
      ${workspace}, ${role}, ${member}, ${creator}, 'workspace'
    ) as result`;
  }

  async function assertManagerCount(expected) {
    const [{ count }] =
      await leader`select count(*)::int from public.workspace_members wm
      where wm.ws_id = ${workspace} and wm.type = 'MEMBER'
        and private.workspace_has_member_manager(wm.ws_id, wm.user_id)`;
    assert.equal(count, expected);
  }

  async function repeatableReadPair(operations, { serviceRole = false } = {}) {
    const [a, b] = await Promise.all([leader.reserve(), follower.reserve()]);
    try {
      for (const sql of [a, b]) {
        await sql`begin isolation level repeatable read`;
        if (serviceRole) await asServiceRole(sql);
        const [{ count }] = await sql`select count(*)::int
          from public.workspace_role_members where role_id = ${role}`;
        assert.equal(
          count,
          2,
          'each transaction saw both managers in its snapshot'
        );
      }
      await operations(a, b);
    } finally {
      // Releasing A first lets B finish if it is waiting on A's row lock.
      await a`rollback`;
      await b`rollback`;
      a.release();
      b.release();
    }
  }

  async function isolationRaces() {
    await leader.begin(async (sql) => {
      await sql`insert into public.workspace_members (ws_id, user_id, type)
        values (${workspace}, ${second}, 'MEMBER')`;
      await sql`insert into public.workspace_role_members (role_id, user_id)
        values (${role}, ${second})`;
    });

    await repeatableReadPair(
      async (a, b) => {
        await assert.rejects(async () => await removeRoleMember(a, first), {
          code: '25000',
        });
        await a`rollback`;
        await assert.rejects(async () => await removeRoleMember(b, second), {
          code: '25000',
        });
      },
      { serviceRole: true }
    );
    await assertManagerCount(2);
    console.log(
      'ok - REPEATABLE READ guarded removals: both returned SQLSTATE 25000 and both managers remain'
    );

    await repeatableReadPair(async (a, b) => {
      const [{ pid }] = await b`select pg_backend_pid() as pid`;
      await a`select id from public.workspaces where id = ${workspace} for update`;
      const lock =
        b`select id from public.workspaces where id = ${workspace} for update`.then(
          (rows) => rows
        );
      void lock.catch(() => {});
      await waitForBlock(
        a,
        pid,
        'the second parent row lock did not wait for the first'
      );
      await a`commit`;
      assert.equal((await lock)[0].id, workspace);
      await b`commit`;
    });
    console.log(
      'ok - REPEATABLE READ FOR UPDATE waited and acquired the unchanged workspace row after the first transaction committed'
    );

    // Without the isolation check, each retained snapshot still shows the other grant.
    await repeatableReadPair(async (a, b) => {
      await a`delete from public.workspace_role_members where role_id = ${role} and user_id = ${first}`;
      await a`commit`;
      const [{ visible }] = await b`select exists (
        select 1 from public.workspace_role_members where role_id = ${role} and user_id = ${first}
      ) as visible`;
      assert(
        visible,
        'the second REPEATABLE READ snapshot still sees the deleted grant'
      );
      await b`delete from public.workspace_role_members where role_id = ${role} and user_id = ${second}`;
      await b`commit`;
    });
    await assertManagerCount(0);
    const [{ count }] =
      await leader`select count(*)::int from public.workspace_members
      where ws_id = ${workspace} and type = 'MEMBER'`;
    assert(
      count > 0,
      'the raw-delete control leaves an orphaned workspace with full members'
    );
    console.log(
      'ok - REPEATABLE READ negative control: both raw role deletes committed and left full members without a manager'
    );

    await leader`insert into public.workspace_role_members (role_id, user_id)
      values (${role}, ${first}), (${role}, ${second})`;
    await race(
      'READ COMMITTED shared-role manager removals',
      (sql) => removeRoleMember(sql, first),
      (sql) => removeRoleMember(sql, second),
      'removed',
      'last_manager'
    );
    await assertManagerCount(1);
  }

  try {
    await leader.begin(async (sql) => {
      await sql`insert into public.workspaces (id, name, creator_id, personal)
        values (${workspace}, 'Manager postcondition race', ${creator}, false)`;
      await sql`delete from public.workspace_members
        where ws_id = ${workspace} and user_id = ${creator}`;
      await sql`insert into public.workspace_members (ws_id, user_id, type)
        values (${workspace}, ${first}, 'MEMBER'), (${workspace}, ${second}, 'MEMBER'),
          (${workspace}, ${ordinaryMember}, 'MEMBER')`;
      await sql`insert into public.workspace_roles (id, ws_id, name)
        values (${role}, ${workspace}, 'Repairable role')`;
    });

    await race(
      'concurrent self-departures from an already-managerless workspace',
      (sql) => depart(sql, first),
      (sql) => depart(sql, second),
      'removed',
      'removed'
    );
    const remaining = await leader`select user_id from public.workspace_members
      where ws_id = ${workspace} and type = 'MEMBER'`;
    assert.deepEqual(
      remaining.map(({ user_id }) => user_id),
      [ordinaryMember]
    );

    await leader.begin(async (sql) => {
      await sql`insert into public.workspace_members (ws_id, user_id, type)
        values (${workspace}, ${first}, 'MEMBER')`;
      await sql`insert into public.workspace_role_members (role_id, user_id)
        values (${role}, ${first})`;
    });
    await race(
      'repair then remove the sole manager',
      repair,
      remove,
      'updated',
      'last_manager'
    );
    const [{ repaired }] =
      await leader`select private.workspace_has_member_manager(${workspace}, ${first}) as repaired`;
    assert(
      repaired,
      'the repaired manager remains after the competing removal'
    );

    await leader`update public.workspace_role_permissions set enabled = false
      where ws_id = ${workspace} and role_id = ${role} and permission = 'manage_workspace_members'`;
    await race(
      'remove a member then repair the workspace',
      remove,
      repair,
      'last_manager',
      'updated'
    );
    const [{ restored }] =
      await leader`select private.workspace_has_member_manager(${workspace}, ${first}) as restored`;
    assert(
      restored,
      'the refused removal leaves the member available for repair'
    );
    await isolationRaces();
  } finally {
    await leader`delete from public.workspaces where id = ${workspace}`;
  }
}
