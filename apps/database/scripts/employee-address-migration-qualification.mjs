import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { qualifyOwnership } from './fixtures/employee-address-migration/ownership-qualification.mjs';

// Run through the canonical resource queue. No ports, host mounts, persistent
// volumes, network access, image pulls, or existing databases are used.
// This minimal Auth fixture proves SQL behavior, NOT GoTrue or full-schema CI.
const exec = promisify(execFile);
const image = 'public.ecr.aws/supabase/postgres:17.11.0.004';
const container = `employee-address-qualification-${randomUUID()}`;
const root = new URL('../supabase/migrations/', import.meta.url);
const migration = await readFile(
  new URL('20261017010000_employee_address_migrations.sql', root),
  'utf8'
);
const prior = await readFile(
  new URL('20261011002107_employee_creation_identity.sql', root),
  'utf8'
);
const fixture = await readFile(
  new URL(
    './fixtures/employee-address-migration/minimal-schema.sql',
    import.meta.url
  ),
  'utf8'
);
const actor = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const operation = '00000000-0000-4000-8000-000000000004';
const attempt = '00000000-0000-4000-8000-000000000005';
const source = 'legacy@staff.tuturuuu.com';
const destination = 'legacy@tuturuuu.com';
const request = {
  actorId: actor,
  userId: user,
  operationId: operation,
  sourceAddress: source,
  destinationAddress: destination,
  expectedRevision: 0,
};
const literal = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const rpc = (action, binding = request, id = null) =>
  `private.employee_address_migration('${action}',${literal(binding)},${id ? `'${id}'::uuid` : 'null'})`;
const results = [];
const failures = [];
async function docker(args) {
  return exec('docker', args, { timeout: 90_000, maxBuffer: 512 * 1024 });
}
async function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      { timeout: 30_000, maxBuffer: 512 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message));
        else resolve(stdout.trim());
      }
    );
    child.stdin.end(statement);
  });
}
async function json(statement) {
  return JSON.parse(await sql(`select ${statement};`));
}
async function rejects(statement, code) {
  await sql(`do $test$ begin
    begin ${statement}; exception when sqlstate '${code}' then return; end;
    raise exception 'Expected SQLSTATE ${code}'; end $test$;`);
}
async function test(name, body) {
  try {
    await seed();
    await body();
    results.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function seed() {
  // Establish a pre-migration population independently of newly installed
  // guards. Every qualification action below runs with triggers enabled.
  await sql(`set session_replication_role=replica;
    truncate private.employee_address_migrations, auth.users, auth.identities,
    public.users, public.user_private_details, public.workspace_members, public.workspaces,
    public.workspace_roles, public.workspace_role_members, public.workspace_role_permissions,
    public.workspace_default_permissions, public.platform_user_roles, public.platform_email_roles, private.mail_domains,
    private.mail_mailboxes, private.mail_mailbox_members, private.infrastructure_employees,
    private.employee_creation_intents, private.employee_creation_operations,
    private.employee_restore_operations cascade;
    insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
      values ('${actor}','admin@tuturuuu.com',now(),'{}','{}'),
      ('${user}','${source}',now(),'{}','{}'), ('${other}','other@example.com',now(),'{}','{}');
    insert into public.users(id,display_name) values ('${actor}','Admin'),('${user}','Legacy'),('${other}','Other');
    insert into public.user_private_details(user_id,email,full_name) values ('${user}','${source}','Legacy');
    insert into public.workspace_members values ('00000000-0000-0000-0000-000000000000','${actor}','MEMBER');
    insert into public.workspaces values ('00000000-0000-0000-0000-000000000000','${actor}');
    insert into auth.identities(id,provider,user_id,identity_data) values ('10000000-0000-4000-8000-000000000001','email','${user}',
      '{"email":"${source}","email_verified":true}');
    insert into private.mail_domains values ('20000000-0000-4000-8000-000000000001','staff.tuturuuu.com','active'),
      ('20000000-0000-4000-8000-000000000002','tuturuuu.com','active');
    insert into private.mail_mailboxes values ('30000000-0000-4000-8000-000000000001','${source}',
      '20000000-0000-4000-8000-000000000001','${user}','personal','active'),
      ('30000000-0000-4000-8000-000000000002','${destination}',
      '20000000-0000-4000-8000-000000000002','${user}','personal','active');
    insert into private.mail_mailbox_members values ('40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001','${user}','owner'),
      ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','${user}','owner');
    set session_replication_role=origin;`);
}
async function binding() {
  const inspected = await json(rpc('inspect'));
  assert.equal(inspected.sourceVerified, true);
  assert.equal(inspected.addressOwnership, 'same_identity');
  return {
    ...request,
    immutableFingerprint: inspected.immutableFingerprint,
    providerIdentityFingerprint: inspected.providerIdentityFingerprint,
  };
}
async function reserve() {
  const bound = await binding();
  assert.equal(await json(rpc('reserve', bound)), true);
  return bound;
}
async function providerEmail(verified) {
  // Explicit fixture simulation: this is not a claim about actual GoTrue writes
  // or the real profile-sync trigger, both require separate integration proof.
  await sql(`update auth.users set email='${destination}' where id='${user}';
    update auth.identities set identity_data='{"email":"${destination}","email_verified":${verified}}' where user_id='${user}';
    update public.user_private_details set email='${destination}' where user_id='${user}';`);
}
// Interactive sessions use explicit completion markers; lock observations decide
// when the competing statement has actually reached its blocking boundary.
function session(name) {
  const child = spawn('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ]);
  let output = '',
    errors = '',
    sequence = 0;
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  return {
    async send(statement) {
      const marker = `qualification_${name}_${++sequence}`;
      child.stdin.write(`${statement};\nselect '${marker}';\n`);
      const deadline = Date.now() + 8000;
      while (!output.includes(marker)) {
        if (child.exitCode !== null)
          throw new Error(errors || 'Session exited');
        if (Date.now() > deadline)
          throw new Error(`Session ${name} timed out: ${errors}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    close() {
      child.stdin.end('rollback;\n');
    },
  };
}
async function waitBlocked(name, event) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (
      (await sql(`select exists(select 1 from pg_stat_activity where
      application_name='${name}' and wait_event_type='Lock' and wait_event='${event}');`)) ===
      't'
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${name} to block on ${event}`);
}
let started = false;
try {
  const identity = (
    await docker([
      'info',
      '--format',
      '{{.Name}} {{.OSType}} {{.ServerVersion}}',
    ])
  ).stdout.trim();
  assert.equal(
    identity,
    'docker-desktop linux 29.8.2',
    'Unexpected daemon; refuse to create fixture'
  );
  await docker(['image', 'inspect', image]);
  await docker([
    'run',
    '--detach',
    '--pull=never',
    '--name',
    container,
    '--network=none',
    '--memory=512m',
    '--cpus=1',
    '--pids-limit=128',
    '--tmpfs',
    '/tmp/qualification:rw,mode=1777',
    '--user',
    'postgres',
    '--entrypoint',
    '/bin/sh',
    image,
    '-c',
    'initdb -D /tmp/qualification/data --auth=trust >/dev/null && exec postgres -D /tmp/qualification/data',
  ]);
  started = true;
  for (let tries = 0; ; tries++) {
    try {
      await sql('select 1;');
      break;
    } catch (error) {
      if (tries === 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await sql(fixture);
  for (const name of [
    'lock_employee_auth_pair',
    'assert_employee_administrator',
  ]) {
    const match = prior.match(
      new RegExp(`create function private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`)
    );
    assert.ok(match, `Missing prerequisite ${name}`);
    await sql(match[0]);
  }
  await sql(`begin; ${migration} commit;`);
  console.log(
    `APPLIED actual migration sha256=${createHash('sha256').update(migration).digest('hex')}`
  );
  await test('ordinary unreserved mailbox write remains available', async () => {
    await sql(
      `update private.mail_mailboxes set address=address where address='${source}';`
    );
  });
  await test('ACL: service RPC only; no direct journal or helper access', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await rejects(
        `set local role ${role}; select * from private.employee_address_migrations`,
        '42501'
      );
      const acl =
        await json(`jsonb_build_object('rpc',has_function_privilege('${role}',
        'private.employee_address_migration(text,jsonb,uuid)','EXECUTE'),
        'state',has_function_privilege('${role}','private.employee_address_state(uuid,text,text)','EXECUTE'),
        'fingerprint',has_function_privilege('${role}','private.employee_address_identity_fingerprint(uuid)','EXECUTE'))`);
      assert.deepEqual(acl, {
        rpc: role === 'service_role',
        state: false,
        fingerprint: false,
      });
    }
    const inspection = JSON.parse(
      await sql(`set role service_role; select ${rpc('inspect')};`)
    );
    assert.equal(inspection.authorized, true);
    assert.equal(
      await sql(
        `select relrowsecurity from pg_class where oid='private.employee_address_migrations'::regclass;`
      ),
      't'
    );
  });
  await test('fresh administrator assertion rejects revoked actor', async () => {
    await sql(`delete from public.workspace_members;`);
    await rejects(`select ${rpc('inspect')}`, '42501');
  });
  await test('fingerprint matches compact provider identity tuple SHA256', async () => {
    const inspected = await json(rpc('inspect'));
    const expected = createHash('sha256')
      .update(
        JSON.stringify([
          ['10000000-0000-4000-8000-000000000001', 'email', user],
        ])
      )
      .digest('hex');
    assert.equal(inspected.providerIdentityFingerprint, expected);
  });
  for (const [name, mutation] of [
    [
      'missing destination',
      `delete from private.mail_mailboxes where address='${destination}'`,
    ],
    [
      'inactive source',
      `update private.mail_mailboxes set status='disabled' where address='${source}'`,
    ],
    [
      'foreign destination owner',
      `update private.mail_mailboxes set created_by='${other}' where address='${destination}'`,
    ],
    [
      'missing source owner membership',
      `delete from private.mail_mailbox_members where mailbox_id='30000000-0000-4000-8000-000000000001'`,
    ],
    [
      'shared destination membership',
      `insert into private.mail_mailbox_members values ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','${other}','member')`,
    ],
    [
      'onboarding registry',
      `insert into private.infrastructure_employees values ('${user}','${source}')`,
    ],
    [
      'email_verified=false',
      `update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false')`,
    ],
  ]) {
    await test(`ineligible ${name}: reservation fails without provisioning`, async () => {
      const bound = await binding();
      await sql(mutation);
      await rejects(`select ${rpc('reserve', bound)}`, '23514');
      assert.equal(
        await sql('select count(*) from private.employee_address_migrations;'),
        '0'
      );
    });
  }
  await test('reserve idempotency and operation/user/address uniqueness', async () => {
    const bound = await reserve();
    assert.equal(await json(rpc('reserve', bound)), true);
    await rejects(
      `select ${rpc('reserve', { ...bound, operationId: randomUUID() })}`,
      '23514'
    );
    await rejects(
      `select ${rpc('reserve', { ...bound, actorId: other })}`,
      '42501'
    );
    assert.equal(
      await sql('select count(*) from private.employee_address_migrations;'),
      '1'
    );
    for (const column of ['user_id', 'source_address', 'destination_address']) {
      assert.equal(
        await sql(`select count(*) from pg_constraint where conrelid='private.employee_address_migrations'::regclass
        and contype='u' and conkey=array[(select attnum from pg_attribute where attrelid='private.employee_address_migrations'::regclass and attname='${column}')]::smallint[];`),
        '1'
      );
    }
  });
  await test('parallel claims have exactly one durable winner', async () => {
    const bound = await reserve();
    const values = await Promise.all([
      json(rpc('claim', bound, attempt)),
      json(rpc('claim', bound, randomUUID())),
    ]);
    assert.deepEqual(values.sort(), [false, true]);
    assert.equal(
      await sql('select phase from private.employee_address_migrations;'),
      'attempted'
    );
  });
  await test('reservation guards reject foreign Auth/identity/profile/mail/grant/intent writers', async () => {
    await reserve();
    for (const statement of [
      `update auth.users set email='${destination}' where id='${other}'`,
      `insert into auth.identities(id,provider,user_id,identity_data) values ('10000000-0000-4000-8000-000000000002','email','${other}','{"email":"${destination}","email_verified":true}')`,
      `insert into public.user_private_details(user_id,email) values ('${other}','${destination}')`,
      `update private.mail_mailboxes set created_by='${other}',address='${destination}' where address='${destination}'`,
      `insert into public.platform_email_roles values ('${destination}')`,
      `insert into private.employee_creation_intents values ('${other}','${destination}')`,
      `update auth.users set email='${destination}' where id='${user}'`,
    ])
      await rejects(statement, '23505');
  });
  await test('fault after reserve/claim rolls back durable journal atomically', async () => {
    const bound = await binding();
    await rejects(
      `perform ${rpc('reserve', bound)}; perform ${rpc('claim', bound, attempt)};
      raise exception using errcode='P0002',message='injected fault'`,
      'P0002'
    );
    assert.equal(
      await sql('select count(*) from private.employee_address_migrations;'),
      '0'
    );
    await reserve();
    await rejects(
      `perform ${rpc('claim', bound, attempt)}; raise exception using errcode='P0002',message='injected fault'`,
      'P0002'
    );
    assert.equal(
      await sql('select phase from private.employee_address_migrations;'),
      'reserved'
    );
  });
  await test('provider email_verified=false stays attempted and cannot complete', async () => {
    const bound = await reserve();
    await json(rpc('claim', bound, attempt));
    await providerEmail(false);
    assert.equal((await json(rpc('inspect'))).sourceVerified, false);
    await rejects(`select ${rpc('complete', bound)}`, '23514');
    assert.equal(
      await sql('select phase from private.employee_address_migrations;'),
      'attempted'
    );
  });
  await test('verified fixture completion preserves immutable state and is idempotent', async () => {
    const bound = await reserve();
    await json(rpc('claim', bound, attempt));
    await providerEmail(true);
    assert.equal(await json(rpc('complete', bound)), true);
    assert.equal(await json(rpc('complete', bound)), true);
    assert.equal((await json(rpc('inspect'))).revision, 1);
    assert.equal(
      await sql('select count(*) from private.infrastructure_employees;'),
      '0'
    );
    assert.equal(
      await sql(`select raw_app_meta_data from auth.users where id='${user}';`),
      '{}'
    );
  });
  await test('fault after completion rolls back receipt; completion can reconcile', async () => {
    const bound = await reserve();
    await json(rpc('claim', bound, attempt));
    await providerEmail(true);
    await rejects(
      `perform ${rpc('complete', bound)};
      raise exception using errcode='P0002',message='injected completion fault'`,
      'P0002'
    );
    assert.equal(
      await sql('select phase from private.employee_address_migrations;'),
      'attempted'
    );
    assert.equal(
      await sql(
        'select completed_at is null from private.employee_address_migrations;'
      ),
      't'
    );
    assert.equal(await json(rpc('complete', bound)), true);
  });
  await test('immutable profile drift rejects completion and preserves attempted phase', async () => {
    const bound = await reserve();
    await json(rpc('claim', bound, attempt));
    await providerEmail(true);
    await sql(
      `update public.users set display_name='Changed' where id='${user}';`
    );
    await rejects(`select ${rpc('complete', bound)}`, '23514');
    assert.equal(
      await sql('select phase from private.employee_address_migrations;'),
      'attempted'
    );
  });
  await test('mailbox writer and migration avoid the former row/advisory deadlock', async () => {
    const writer = session('mailbox_writer'),
      migrationSession = session('migration_waiter');
    let pending;
    try {
      await writer.send(`set application_name='mailbox_writer'; begin;
        set local statement_timeout='6s';
        update private.mail_mailboxes set address=address where address='${source}'`);
      await migrationSession.send(`set application_name='migration_waiter'; begin;
        set local statement_timeout='6s'`);
      pending = migrationSession.send(`select ${rpc('inspect')}`);
      pending.catch(() => {});
      await waitBlocked('migration_waiter', 'advisory');
      // This needs the Auth row that the old migration locked before admission.
      await writer.send(
        `update auth.users set email=email where id='${user}'; commit`
      );
      await pending;
      await migrationSession.send('commit');
    } finally {
      writer.close();
      migrationSession.close();
      if (pending) await pending.catch(() => {});
    }
  });
  for (const phase of ['attempted', 'completed']) {
    await test(`both addresses reject foreign Auth/identity writes after ${phase}`, async () => {
      const bound = await reserve();
      await json(rpc('claim', bound, attempt));
      await providerEmail(true);
      if (phase === 'completed') await json(rpc('complete', bound));
      for (const address of [source, destination]) {
        await rejects(
          `update auth.users set email='${address}' where id='${other}'`,
          '23505'
        );
        await rejects(
          `insert into auth.identities(id,provider,user_id,identity_data)
          values ('10000000-0000-4000-8000-000000000002','email','${other}',
          '{"email":"${address}","email_verified":true}')`,
          '23505'
        );
      }
      assert.equal(
        await sql('select phase from private.employee_address_migrations;'),
        phase
      );
    });
  }
  for (const mutation of ['deleted_at=now()', 'is_anonymous=true']) {
    await test(`actor ${mutation} rejected on fresh inspection and retained claim`, async () => {
      const bound = await reserve();
      await sql(`update auth.users set ${mutation} where id='${actor}'`);
      await rejects(`select ${rpc('inspect')}`, '42501');
      await rejects(`select ${rpc('claim', bound, attempt)}`, '42501');
    });
  }
  await test('actor workspace default grant revocation denies retained claim', async () => {
    await sql(`update public.workspaces set creator_id='${other}';
      insert into public.workspace_default_permissions values
      ('00000000-0000-0000-0000-000000000000','MEMBER','manage_internal_accounts',true)`);
    const bound = await reserve();
    await sql('update public.workspace_default_permissions set enabled=false');
    await rejects(`select ${rpc('claim', bound, attempt)}`, '42501');
  });
  await test('target workspace grant drift rejects completion', async () => {
    const bound = await reserve();
    await json(rpc('claim', bound, attempt));
    await providerEmail(true);
    await sql(`insert into public.workspace_role_members values
      ('50000000-0000-4000-8000-000000000001','${user}')`);
    await rejects(`select ${rpc('complete', bound)}`, '23514');
    assert.equal(
      await sql('select phase from private.employee_address_migrations;'),
      'attempted'
    );
  });
  await test('concurrent administrator revocation blocks behind migration SHARE table lock', async () => {
    const migrationSession = session('migration_holder'),
      revoker = session('revoker');
    let pending;
    try {
      await migrationSession.send(
        `begin; set local statement_timeout='6s'; select ${rpc('inspect')}`
      );
      await revoker.send(
        `set application_name='revoker'; begin; set local statement_timeout='6s'`
      );
      pending = revoker.send(
        `delete from public.workspace_members where user_id='${actor}'`
      );
      pending.catch(() => {});
      await waitBlocked('revoker', 'relation');
      await migrationSession.send('commit');
      await pending;
      await revoker.send('commit');
      await rejects(`select ${rpc('inspect')}`, '42501');
    } finally {
      migrationSession.close();
      revoker.close();
      if (pending) await pending.catch(() => {});
    }
  });
  await test('existing CREATE Auth-row holder forces prompt 55P03 before guarded write', async () => {
    const holder = session('create_finalizer');
    try {
      await holder.send(`begin; set local statement_timeout='6s';
        select id from auth.users where id='${actor}' for update`);
      const startedAt = Date.now();
      await assert.rejects(
        sql(`\\set VERBOSITY verbose
        begin; set local statement_timeout='2s'; select ${rpc('inspect')}; commit;`),
        /55P03/
      );
      assert.ok(
        Date.now() - startedAt < 2000,
        'NOWAIT must fail before statement timeout'
      );
      assert.equal(
        await sql('select count(*) from private.employee_address_migrations;'),
        '0'
      );
      await holder.send(`update private.mail_mailboxes set address=address
        where address='${source}'; commit`);
    } finally {
      holder.close();
    }
  });
  await test('existing permission-table holder forces prompt 55P03', async () => {
    const holder = session('permission_writer');
    try {
      await holder.send(
        'begin; lock table public.workspace_members in row exclusive mode'
      );
      await assert.rejects(
        sql(`\\set VERBOSITY verbose
        begin; set local statement_timeout='2s'; select ${rpc('inspect')}; commit;`),
        /55P03/
      );
      await holder.send(`update private.mail_mailboxes set address=address
        where address='${source}'; commit`);
    } finally {
      holder.close();
    }
  });
  await qualifyOwnership({
    test,
    reserve,
    json,
    rpc,
    providerEmail,
    sql,
    rejects,
    user,
    other,
    attempt,
    source,
    destination,
  });
  for (const isolation of ['repeatable read', 'serializable']) {
    await test(`migration RPC rejects ${isolation} isolation`, async () => {
      await assert.rejects(
        sql(`\\set VERBOSITY verbose
        begin isolation level ${isolation}; select ${rpc('inspect')}; commit;`),
        /25001.*Address migration requires read committed/s
      );
      assert.equal(
        await sql('select count(*) from private.employee_address_migrations;'),
        '0'
      );
    });
    await test(`guarded writers reject ${isolation} isolation`, async () => {
      await assert.rejects(
        sql(`begin isolation level ${isolation};
        update auth.users set email=email where id='${other}'; commit;`),
        /Address writer requires read committed/
      );
    });
  }
  console.log(
    JSON.stringify({
      scope: 'real-postgresql-minimal-schema-fixture',
      daemon: identity,
      migrationSha256: createHash('sha256').update(migration).digest('hex'),
      passed: results.length,
      failures,
      fullSchema: 'NOT RUN; existing full-schema CI remains required',
      goTrue: 'NOT RUN; provider mutation simulated explicitly',
    })
  );
  if (failures.length) process.exitCode = 1;
} finally {
  if (started) await docker(['rm', '--force', '--volumes', container]);
}
