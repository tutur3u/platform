import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  listDockerContainerNames,
  readLifecycleMetadata,
  runIsolatedLifecycle,
  stageDisposableProject,
} from '../../scripts/run-supabase-isolated.js';
import { ensureSupabaseBinary } from '../../scripts/run-supabase.js';

const require = createRequire(
  new URL('../../../../packages/inventory-core/package.json', import.meta.url)
);
const postgres = require('postgres');
const repositoryRoot = fileURLToPath(
  new URL('../../../../', import.meta.url)
).replace(/\/$/, '');

async function runDisposableRace() {
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const identity = deriveIsolatedIdentity({
    headSha,
    repositoryPath: repositoryRoot,
  });
  assert(!hasProjectCollision(identity.projectId, listDockerContainerNames()));
  const { basePort } = await chooseAvailablePortBlock(identity);
  const binaryPath = await ensureSupabaseBinary();
  const metadata = await stageDisposableProject({
    basePort,
    headSha,
    projectId: identity.projectId,
    repositoryRoot,
  });

  return runIsolatedLifecycle({
    binaryPath,
    metadata,
    runner: async (command, args, cwd) => {
      if (args.includes('test') && args.includes('db')) {
        await runRace(metadata);
        if (negativeControls) await runNegativeControls(metadata);
        return { code: 0 };
      }
      const result = spawnSync(command, args, {
        cwd,
        stdio: args.includes('start')
          ? ['ignore', 'ignore', 'inherit']
          : 'inherit',
      });
      return { code: result.status ?? 1 };
    },
  });
}

async function runRace(metadata) {
  const clients = Array.from({ length: 2 }, (_, index) =>
    postgres({
      host: '127.0.0.1',
      port: metadata.basePort + 2,
      database: 'postgres',
      username: 'postgres',
      password: 'postgres',
      max: 1,
      connection: {
        application_name: `guarded-removal-race-${index}`,
        statement_timeout: '30s',
      },
    })
  );

  const rootWs = '00000000-0000-0000-0000-000000000000';
  const workspace = randomUUID();
  const managerRole = randomUUID();
  const rootRole = randomUUID();
  const creator = randomUUID();
  const ordinaryMember = randomUUID();
  const actors = [randomUUID(), randomUUID()];
  const trials = 12;

  function remove(sql, kind, actor, target) {
    return kind === 'member'
      ? sql`select public.remove_workspace_member_guarded(${workspace}, ${target}, ${actor}) as result`
      : sql`select public.remove_workspace_role_member_guarded(${workspace}, ${managerRole}, ${target}, ${actor}) as result`;
  }

  async function asServiceRole(sql) {
    await sql`set local role service_role`;
    await sql`set local request.jwt.claims = '{"role":"service_role"}'`;
  }

  async function waitForBlock(sql, pid, message, finished = () => false) {
    const deadline = Date.now() + 15000;
    while (true) {
      const [{ blocked }] =
        await sql`select pg_backend_pid() = any(pg_blocking_pids(${pid})) as blocked`;
      if (blocked) return;
      assert(!finished() && Date.now() < deadline, message);
      await delay(10);
    }
  }

  async function race(kind, first, expectedRefusal) {
    const [leader, follower] = [clients[first], clients[1 - first]];
    const [actor, target] = [actors[first], actors[1 - first]];
    await leader.begin(async (sql) => {
      await sql`insert into public.workspace_members (ws_id, user_id, type)
      values (${workspace}, ${actor}, 'MEMBER'), (${workspace}, ${target}, 'MEMBER')
      on conflict do nothing`;
      await sql`insert into public.workspace_role_members (role_id, user_id)
      values (${managerRole}, ${actor}), (${managerRole}, ${target})
      on conflict do nothing`;
    });

    const [{ pid }] = await follower`select pg_backend_pid() as pid`;
    let pending;
    try {
      const [{ result }] = await leader.begin(
        'isolation level read committed',
        async (sql) => {
          await sql`select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended('cms-member-removal/' || ${workspace}::text, 0)
        )`;

          let finished = false;
          pending = follower.begin(
            'isolation level read committed',
            async (concurrent) => {
              await asServiceRole(concurrent);
              return remove(concurrent, kind, target, actor);
            }
          );
          void pending.then(
            () => {
              finished = true;
            },
            () => {
              finished = true;
            }
          );
          await waitForBlock(
            sql,
            pid,
            'The competing RPC did not wait for the advisory lock',
            () => finished
          );

          await asServiceRole(sql);
          return remove(sql, kind, actor, target);
        }
      );
      assert.equal(result, 'removed');
      const [{ result: refusal }] = await pending;
      assert.equal(refusal, expectedRefusal);

      const survivors = await leader`
      select user_id from public.workspace_members
      where ws_id = ${workspace} and type = 'MEMBER'
        and public.has_workspace_permission(${workspace}, user_id, 'manage_workspace_members')
    `;
      assert.deepEqual(
        survivors.map(({ user_id }) => user_id),
        [actor]
      );
    } finally {
      if (pending) await Promise.allSettled([pending]);
    }
  }

  async function raceAcrossPaths(
    label,
    operationA,
    operationB,
    expectedManagers = 1
  ) {
    const [leader, follower] = clients;
    const [{ pid }] = await follower`select pg_backend_pid() as pid`;
    let pending;
    let finished = false;
    try {
      const [{ result }] = await leader.begin(async (sql) => {
        await sql`select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended('cms-member-removal/' || ${workspace}::text, 0)
        )`;
        pending = follower.begin(async (concurrent) => {
          await asServiceRole(concurrent);
          return operationB(concurrent);
        });
        void pending.then(
          () => {
            finished = true;
          },
          () => {
            finished = true;
          }
        );
        await waitForBlock(
          sql,
          pid,
          `${label} did not wait for the advisory lock`,
          () => finished
        );
        const [{ advisory }] = await sql`
          select exists (
            select 1 from pg_locks where pid = ${pid} and locktype = 'advisory' and not granted
          ) as advisory
        `;
        assert(advisory, `${label} is waiting for a different lock`);
        await asServiceRole(sql);
        return operationA(sql);
      });
      assert.equal(result, 'removed', label);
      const [{ result: refusal }] = await pending;
      assert.equal(refusal, 'last_manager', label);
      const [{ count }] = await leader`
        select count(*)::int from public.workspace_members
        where ws_id = ${workspace} and type = 'MEMBER'
          and public.has_workspace_permission(${workspace}, user_id, 'manage_workspace_members')
      `;
      assert.equal(count, expectedManagers, label);
      console.log(
        `ok - ${label}: one removal committed, ${count} member manager(s) remaining`
      );
    } finally {
      if (pending) await Promise.allSettled([pending]);
    }
  }

  async function crossPathRaces() {
    const [first, second] = actors;
    const separateRole = randomUUID();
    await clients[0]`insert into public.workspace_members (ws_id, user_id, type)
      values (${workspace}, ${ordinaryMember}, 'MEMBER')`;
    const insertManagers = async (sql) => {
      await sql`insert into public.workspace_members (ws_id, user_id, type)
        values (${workspace}, ${first}, 'MEMBER'), (${workspace}, ${second}, 'MEMBER')
        on conflict do nothing`;
      await sql`insert into public.workspace_role_members (role_id, user_id)
        values (${managerRole}, ${first}), (${managerRole}, ${second}) on conflict do nothing`;
    };

    await clients[0].begin(insertManagers);
    await raceAcrossPaths(
      'workspace and CMS managers removing each other',
      (sql) =>
        sql`select public.remove_workspace_member_guarded_in_mode(${workspace}, ${second}, ${first}, 'workspace') as result`,
      (sql) =>
        sql`select public.remove_workspace_member_guarded_in_mode(${workspace}, ${first}, ${second}, 'cms') as result`
    );

    await clients[0].begin(insertManagers);
    await raceAcrossPaths(
      'workspace removal vs legacy CMS removal',
      (sql) =>
        sql`select public.remove_workspace_member_guarded_in_mode(${workspace}, ${second}, ${first}, 'workspace') as result`,
      (sql) =>
        sql`select public.remove_workspace_member_guarded(${workspace}, ${first}, ${second}) as result`
    );

    async function prepareRoleDeleteRace(sql) {
      await insertManagers(sql);
      await sql`insert into public.workspace_roles (id, ws_id, name)
        values (${separateRole}, ${workspace}, 'Role delete race manager') on conflict do nothing`;
      await sql`insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
        values (${separateRole}, ${workspace}, 'manage_workspace_members', true) on conflict do nothing`;
      await sql`insert into public.workspace_role_members (role_id, user_id)
        values (${separateRole}, ${first}) on conflict do nothing`;
      await sql`delete from public.workspace_role_members where role_id = ${managerRole} and user_id = ${first}`;
    }

    const deleteRole = (sql) =>
      sql`select public.delete_workspace_role_guarded(${workspace}, ${separateRole}, ${first}, 'cms') as result`;
    const removeMember = (sql) =>
      sql`select public.remove_workspace_member_guarded_in_mode(${workspace}, ${second}, ${creator}, 'workspace') as result`;

    await clients[0].begin(prepareRoleDeleteRace);
    await raceAcrossPaths(
      'CMS role delete vs workspace member removal',
      deleteRole,
      removeMember
    );
    await clients[0].begin(prepareRoleDeleteRace);
    await raceAcrossPaths(
      'workspace member removal vs CMS role delete',
      removeMember,
      deleteRole
    );

    await clients[0].begin(async (sql) => {
      await insertManagers(sql);
      await sql`delete from public.workspace_roles where id = ${separateRole}`;
    });
    await raceAcrossPaths(
      'legacy CMS member removal vs workspace role membership removal',
      (sql) =>
        sql`select public.remove_workspace_member_guarded(${workspace}, ${second}, ${first}) as result`,
      (sql) =>
        sql`select public.remove_workspace_role_member_guarded_in_mode(
          ${workspace}, ${managerRole}, ${first}, ${creator}, 'workspace'
        ) as result`
    );

    await clients[0].begin(async (sql) => {
      await insertManagers(sql);
      await sql`insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
        values
          (${workspace}, 'manage_workspace_members', 'MEMBER', true),
          (${workspace}, 'manage_workspace_roles', 'MEMBER', true)
        on conflict (ws_id, permission, member_type) do update set enabled = excluded.enabled`;
    });
    await raceAcrossPaths(
      'workspace member removal vs external-app demotion',
      (sql) =>
        sql`select public.remove_workspace_member_guarded_in_mode(
          ${workspace}, ${first}, ${creator}, 'workspace'
        ) as result`,
      (sql) =>
        sql`select public.reduce_external_app_workspace_admin_guarded(
          ${workspace}, ${ordinaryMember}, true, ${second}
        ) as result`,
      2
    );
    await clients[0]`delete from public.workspace_default_permissions
      where ws_id = ${workspace} and member_type = 'MEMBER'
        and permission in ('manage_workspace_members', 'manage_workspace_roles')`;
  }

  async function enableRecurrence() {
    await clients[0].begin(async (sql) => {
      await sql`insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
        values (${managerRole}, ${workspace}, 'manage_projects', true)`;
      await sql`grant task_recurrence_operator to postgres with set true`;
      await sql`set local role task_recurrence_operator`;
      await sql`select private.task_recurrence_set_control(true, false, 1)`;
      await sql`select private.task_recurrence_set_workspace(${workspace}, true, 0)`;
    });
  }

  async function recurrenceRace(label, removeMember) {
    const [completion, removal] = clients;
    const [actor, owner] = actors;
    const board = randomUUID();
    const openList = randomUUID();
    const doneList = randomUUID();
    const [{ expiry }] =
      await completion`select (statement_timestamp() + interval '1 day')::text as expiry`;
    const { task_id: task, series_id: series } = await completion.begin(
      async (sql) => {
        await sql`insert into public.workspace_members (ws_id, user_id, type)
        values (${workspace}, ${actor}, 'MEMBER'), (${workspace}, ${owner}, 'MEMBER') on conflict do nothing`;
        await sql`insert into public.workspace_role_members (role_id, user_id)
        values (${managerRole}, ${actor}), (${managerRole}, ${owner}) on conflict do nothing`;
        await sql`insert into public.workspace_boards (id, ws_id, name, creator_id)
        values (${board}, ${workspace}, ${`Recurrence board for ${label}`}, ${owner})`;
        await sql`insert into public.task_lists (id, board_id, name, status, creator_id)
        values
          (${openList}, ${board}, 'Recurring active', 'active', ${owner}),
          (${doneList}, ${board}, 'Recurring done', 'done', ${owner})`;
        await asServiceRole(sql);
        const [{ created }] = await sql`select private.task_recurrence_create(
        ${workspace}, ${owner}, ${openList}, ${randomUUID()}, ${expiry}::timestamptz, 2, 1,
        '{"rule":{"version":1,"frequency":"daily","interval":1,"timeZone":"UTC","end":{"type":"count","count":2}},
          "anchor_date":"2026-11-25","start_offset_days":0,"due_time":null,
          "template":{"title":"Recurring task","description":null,"priority":null,"estimate":null,"labels":[],"projects":[],"assignees":[]}}'::jsonb,
        '{"version":1,"date":"2026-11-25","next_date":"2026-11-26","anchor_at":"2026-11-25T00:00:00Z","next_at":"2026-11-26T00:00:00Z",
          "start_at":"2026-11-25T23:59:59.999Z","end_at":"2026-11-25T23:59:59.999Z","skip":false}'::jsonb
      ) as created`;
        return created;
      }
    );

    const [{ pid }] = await removal`select pg_backend_pid() as pid`;
    let pending;
    try {
      const completed = await completion.begin(
        'isolation level read committed',
        async (sql) => {
          // Pause at the completion path's gate/series boundary, before it locks the member.
          await sql`select ws_id from private.task_recurrence_workspace where ws_id = ${workspace} for update`;
          await sql`select id from private.task_recurrence_series where id = ${series} for update`;
          pending = removal.begin(
            'isolation level read committed',
            async (concurrent) => {
              await asServiceRole(concurrent);
              return removeMember(concurrent, actor, owner);
            }
          );
          pending.catch(() => {});
          await waitForBlock(
            sql,
            pid,
            `${label} did not wait behind recurrence completion`
          );
          await asServiceRole(sql);
          const [{ result }] =
            await sql`select private.task_recurrence_begin_completion(
          ${workspace}, ${owner}, ${task}, ${doneList}, 1000000, ${randomUUID()}, ${expiry}::timestamptz
        ) as result`;
          return result;
        }
      );
      assert.deepEqual(completed, { status: 'completed', pending: true });
      const [{ result: removed }] = await pending;
      assert.equal(removed, 'removed');
      const [{ state, state_reason: reason }] = await completion`
        select state, state_reason from private.task_recurrence_series where id = ${series}
      `;
      assert.equal(state, 'paused');
      assert.equal(reason, 'owner_ineligible');
      console.log(
        `ok - ${label} waited for recurrence completion and paused the departed owner series`
      );
    } finally {
      if (pending) await Promise.allSettled([pending]);
    }
  }

  try {
    const [{ installed }] = await clients[0]`
    select
      to_regprocedure('public.remove_workspace_member_guarded(uuid,uuid,uuid)') is not null
      and to_regprocedure('public.remove_workspace_role_member_guarded(uuid,uuid,uuid,uuid)') is not null
      and to_regprocedure('public.remove_workspace_member_guarded_in_mode(uuid,uuid,uuid,text,boolean)') is not null
      and to_regprocedure('public.remove_workspace_role_member_guarded_in_mode(uuid,uuid,uuid,uuid,text,boolean)') is not null
      and to_regprocedure('public.delete_workspace_role_guarded(uuid,uuid,uuid,text)') is not null
      and to_regprocedure('public.reduce_external_app_workspace_admin_guarded(uuid,uuid,boolean,uuid)') is not null
      as installed
  `;
    assert(installed, 'All guarded removal RPCs must be installed');

    await clients[0].begin(async (sql) => {
      for (const id of [creator, ordinaryMember, ...actors]) {
        await sql`insert into auth.users (id, email) values (${id}, ${`${id}@example.test`})`;
      }
      await sql`insert into public.workspaces (id, name, creator_id, personal)
      values (${workspace}, 'Guarded removal race', ${creator}, false)`;
      await sql`delete from public.workspace_members where ws_id = ${workspace} and user_id = ${creator}`;
      await sql`insert into public.workspace_roles (id, ws_id, name)
      values (${rootRole}, ${rootWs}, 'Guarded race root operator'), (${managerRole}, ${workspace}, 'Guarded race manager')`;
      await sql`insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
      values
        (${managerRole}, ${workspace}, 'manage_workspace_members', true),
        (${managerRole}, ${workspace}, 'manage_workspace_roles', true),
        (${managerRole}, ${workspace}, 'edit_external_projects', true),
        (${rootRole}, ${rootWs}, 'manage_external_projects', true)`;
    });

    for (const kind of ['member', 'role member']) {
      for (let trial = 0; trial < trials; trial++) {
        await race(kind, trial % 2, 'forbidden');
      }
      console.log(
        `ok - ${kind}: ${trials}/${trials} races returned removed and forbidden with one manager remaining`
      );
    }

    await clients[0].begin(async (sql) => {
      for (const actor of actors) {
        await sql`insert into public.workspace_members (ws_id, user_id, type) values (${rootWs}, ${actor}, 'MEMBER')`;
        await sql`insert into public.workspace_role_members (role_id, user_id) values (${rootRole}, ${actor})`;
      }
    });
    for (const kind of ['member', 'role member']) {
      for (let trial = 0; trial < trials; trial++) {
        await race(kind, trial % 2, 'last_manager');
      }
      console.log(
        `ok - ${kind}: ${trials}/${trials} races returned removed and last_manager with one manager remaining`
      );
    }
    await crossPathRaces();
    await enableRecurrence();
    await recurrenceRace('legacy CMS member removal', (sql, actor, owner) =>
      remove(sql, 'member', actor, owner)
    );
    await recurrenceRace(
      'workspace mode member removal',
      (sql, actor, owner) =>
        sql`select public.remove_workspace_member_guarded_in_mode(
        ${workspace}, ${owner}, ${actor}, 'workspace'
      ) as result`
    );
  } finally {
    try {
      await clients[0]`delete from public.workspaces where id = ${workspace}`;
      await clients[0]`delete from public.workspace_roles where id = ${rootRole}`;
      await clients[0]`delete from auth.users where id in ${clients[0]([creator, ordinaryMember, ...actors])}`;
    } finally {
      await Promise.all(clients.map((sql) => sql.end({ timeout: 5 })));
    }
  }
}

async function runNegativeControls(metadata) {
  const sql = postgres({
    host: '127.0.0.1',
    port: metadata.basePort + 2,
    database: 'postgres',
    username: 'postgres',
    password: 'postgres',
    max: 1,
  });
  const script = fileURLToPath(import.meta.url);
  function assertRaceFails(expected) {
    const child = spawnSync(
      process.execPath,
      [script, metadata.disposableRoot],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(child.status, 1, child.stderr);
    assert(child.stderr.includes(expected), child.stderr);
    console.log(`ok - negative control: ${expected}`);
  }

  try {
    const controls = [
      [
        'public.remove_workspace_member_guarded_in_mode(uuid,uuid,uuid,text,boolean)',
        'workspace and CMS managers removing each other did not wait for the advisory lock',
      ],
      [
        'public.delete_workspace_role_guarded(uuid,uuid,uuid,text)',
        'workspace member removal vs CMS role delete did not wait for the advisory lock',
      ],
      [
        'public.remove_workspace_role_member_guarded_in_mode(uuid,uuid,uuid,uuid,text,boolean)',
        'legacy CMS member removal vs workspace role membership removal did not wait for the advisory lock',
      ],
      [
        'public.reduce_external_app_workspace_admin_guarded(uuid,uuid,boolean,uuid)',
        'workspace member removal vs external-app demotion did not wait for the advisory lock',
      ],
    ];

    for (const [signature, expected] of controls) {
      const [{ definition }] = await sql`
        select pg_get_functiondef(${signature}::regprocedure) as definition
      `;
      const withoutLock = definition.replace(
        /^  PERFORM pg_catalog\.pg_advisory_xact_lock\([^\n]+;/m,
        ''
      );
      assert.notEqual(withoutLock, definition, signature);
      await sql.unsafe(withoutLock);
      try {
        assertRaceFails(expected);
      } finally {
        await sql.unsafe(definition);
      }
    }

    await sql`alter function public.delete_workspace_role_guarded(uuid,uuid,uuid,text)
      rename to disabled_role_delete_for_test`;
    try {
      assertRaceFails('All guarded removal RPCs must be installed');
    } finally {
      await sql`alter function public.disabled_role_delete_for_test(uuid,uuid,uuid,text)
        rename to delete_workspace_role_guarded`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const args = process.argv.slice(2);
const [disposableRoot] = args.filter((arg) => arg !== '--negative-controls');
const negativeControls = args.includes('--negative-controls');

if (disposableRoot) {
  const metadata = await readLifecycleMetadata(disposableRoot);
  assert.equal(metadata.repositoryRoot, repositoryRoot);
  assert.equal(metadata.status, 'testing');
  await runRace(metadata);
  if (negativeControls) await runNegativeControls(metadata);
} else {
  process.exitCode = await runDisposableRace();
}
