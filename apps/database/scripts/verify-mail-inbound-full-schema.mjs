#!/usr/bin/env node
/** Root-admitted hosted fixture only. Never invoke against a linked database. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStrictTap } from './programming-database-tap.mjs';
import {
  getBundledSupabaseBinaryPath,
  getSupabaseWrapperPath,
} from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  removeDisposableRoot,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

export const sourceSha = 'b06aef6987eb8272dd260c97b7e12b335aee025b';
export const sourceTree = '3f7c6bc2cb3cf1d33ff2d005ff2ec2239ec5e325';
export const fixturePath =
  'apps/database/supabase/tests/mail-inbound-full-schema.sql';
export const assertionCount = 40;
export const namespace = '62550000-0000-4000-8000-';
const projectLabel = 'com.supabase.cli.project';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const excluded =
  'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';

// Pinned upstream v2.117.0: apps/cli-go/cmd/root.go registers --network-id;
// internal/utils/config.go binds NetId; internal/utils/docker.go DockerCreate
// overrides hostConfig.NetworkMode for *every* container. db/reset/reset.go
// recreates PostgreSQL 17 through that same DockerStart path. gen/types/types.go
// also uses DockerRun, but this controller never invokes typegen.
// Root must create and finally remove the labeled internal network. The CLI
// can create a NON-internal network if its supplied ID is absent, so inspect
// before each phase and hold admission if the network disappears.
// Moby API v1.44+ rejects duplicate names systematically. Require that daemon
// capability, pass the inspected NAME to CLI, and pin its ID independently.
// https://docs.docker.com/reference/api/engine/version-history/
// Do not attach com.supabase.cli.project to the root network: normal CLI stop
// prunes networks with that label. Root retains sole network removal authority.

export function assertDockerApiVersion(version) {
  const match = /^1\.(\d+)$/u.exec(version);
  if (!match || Number(match[1]) < 44)
    throw new Error(
      'Held: Docker duplicate network-name conflict capability unproven'
    );
}

export function assertNetworkInventory(cliIds, rootIds, networkId) {
  if (cliIds.length || rootIds.length !== 1 || rootIds[0] !== networkId)
    throw new Error(
      'Held: unexpected project network or lost root-owned network'
    );
}

export function boundedExecutor(exec, env, defaultCwd) {
  return (binary, args, cwd = defaultCwd, timeout = 60_000) => {
    try {
      return exec(binary, args, {
        cwd,
        env,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch {
      throw new Error('Qualification subprocess failed; raw output withheld');
    }
  };
}

export function assertDrained(ids, names, network, projectId) {
  if (
    ids.length ||
    names.some((n) => n.endsWith(`_${projectId}`)) ||
    Object.keys(network.Containers ?? {}).length
  )
    throw new Error('Owned project/transient container drain incomplete');
}

export function assertFixturePolicy(sql) {
  const active = sql.replace(/--[^\n]*/gu, '');
  if (
    /\bcommit\b|\btruncate\b|(?:create|replace)\s+(?:or\s+replace\s+)?function\s+net\.|cron\.(?:schedule|unschedule)/iu.test(
      active
    ) ||
    [...active.matchAll(/delete\s+from\s+[^;]+;/giu)].some(
      ([statement]) => !/\bwhere\b/iu.test(statement)
    ) ||
    !active.includes(
      'alter table private.notification_batches disable trigger trigger_send_immediate_notification;'
    ) ||
    !active.includes(`select plan(${assertionCount});`) ||
    !/select \* from finish\(\);\s*rollback;\s*$/u.test(active) ||
    (active.match(/^select (?:ok|is|throws_ok)\(/gmu) ?? []).length !==
      assertionCount
  )
    throw new Error('Unsafe or incomplete full-schema Mail rollback fixture');
}

export function assertFixtureTap(tap) {
  assertStrictTap(tap);
  if (!tap.startsWith(`1..${assertionCount}\n`))
    throw new Error('Mail full-schema assertion count mismatch');
}

export function assertLedger(expected, actual) {
  if (
    expected.length !== 1382 ||
    new Set(expected).size !== expected.length ||
    JSON.stringify(expected) !== JSON.stringify(actual)
  )
    throw new Error('Frozen Mail full migration ledger mismatch');
}

export function admitEnvironment(env, fixtureHash) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.MAIL_FULL_SCHEMA_ADMISSION !== `${sourceSha}:${fixtureHash}` ||
    !env.MAIL_FULL_SCHEMA_SOURCE_ROOT ||
    !env.MAIL_FULL_SCHEMA_NETWORK_ID ||
    !env.RUNNER_TEMP
  )
    throw new Error(
      'Held: root hosted source/fixture/network admission required'
    );
  if (
    (env.DOCKER_HOST && env.DOCKER_HOST !== 'unix:///var/run/docker.sock') ||
    (env.DOCKER_CONTEXT && env.DOCKER_CONTEXT !== 'default')
  )
    throw new Error('Held: remote or alternate Docker daemon prohibited');
  for (const [name, value] of Object.entries(env)) {
    if (
      value &&
      /^(?:SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|SERVICE_ROLE_KEY|URL|CLI_BINARY_OVERRIDE)|DATABASE_URL|PGHOST|PGPASSWORD|AWS_|CLOUDFLARE_|SENDGRID_|OPENAI_API_KEY|S3_|SUPABASE_AUTH_)/u.test(
        name
      )
    )
      throw new Error(
        'Held: fixture environment contains prohibited credentials/configuration'
      );
  }
}

export function assertOwnedNetwork(
  network,
  fixtureHash,
  projectId,
  empty = false
) {
  if (
    !network?.Internal ||
    network.Driver !== 'bridge' ||
    network.EnableIPv6 ||
    network.Name !== `mail-qualification-${projectId}` ||
    network.Labels?.[projectLabel] ||
    network.Labels?.['tuturuuu.mail.source'] !== sourceSha ||
    network.Labels?.['tuturuuu.mail.fixture'] !== fixtureHash ||
    network.Labels?.['tuturuuu.mail.project'] !== projectId ||
    (empty && Object.keys(network.Containers ?? {}).length)
  )
    throw new Error('Held: dedicated owned internal network is not proven');
}

export function assertProjectContainers(containers, networkId, projectId) {
  if (
    !containers.length ||
    !containers.some((c) => c.Name === `/supabase_db_${projectId}`)
  )
    throw new Error('Held: owned database container missing');
  for (const c of containers) {
    const networks = Object.values(c.NetworkSettings?.Networks ?? {});
    if (
      c.Config?.Labels?.[projectLabel] !== projectId ||
      c.HostConfig?.Privileged ||
      c.HostConfig?.CapAdd?.length ||
      networks.length !== 1 ||
      networks[0].NetworkID !== networkId ||
      c.HostConfig?.NetworkMode === 'host'
    )
      throw new Error(
        'Held: project container escapes its owned internal network'
      );
  }
}

const relations = [
  'auth.users',
  'public.users',
  'public.workspaces',
  'public.workspace_members',
  'public.platform_user_roles',
  'public.user_private_details',
  'private.mail_domains',
  'private.mail_mailboxes',
  'private.mail_mailbox_members',
  'private.mail_threads',
  'private.mail_raw_messages',
  'private.mail_messages',
  'private.mail_labels',
  'private.mail_message_labels',
  'private.mail_message_user_state',
  'private.mail_thread_user_state',
  'private.mail_notification_receipts',
  'public.notification_preferences',
  'public.notifications',
  'private.notification_batches',
  'private.notification_delivery_log',
];

// Full trigger inventory hashes include Auth/workspace side effects. No bodies or rows logged.
export const snapshotSql = `select json_build_object(
 'triggers',(select coalesce(json_agg(row_to_json(t) order by t.rel,t.name),'[]') from
 (select n.nspname||'.'||c.relname rel,g.tgname name,g.tgenabled state,
   pn.nspname||'.'||p.proname function,md5(p.prosrc) body,
   md5(pg_get_triggerdef(g.oid)) definition
  from pg_trigger g join pg_class c on c.oid=g.tgrelid
  join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=g.tgfoid
  join pg_namespace pn on pn.oid=p.pronamespace
  where not g.tgisinternal and n.nspname in ('auth','public','private')) t),
 'owned',(select count(*) from auth.users where id::text like '${namespace}%')
  +(select count(*) from public.users where id::text like '${namespace}%')
  +(select count(*) from public.workspaces where creator_id::text like '${namespace}%')
  +(select count(*) from public.workspaces where id::text like '${namespace}%')
  +(select count(*) from private.mail_domains where id::text like '${namespace}%')
  +(select count(*) from private.mail_mailboxes where id::text like '${namespace}%')
  +(select count(*) from private.mail_mailbox_members where id::text like '${namespace}%')
  +(select count(*) from private.mail_threads where id::text like '${namespace}%')
  +(select count(*) from private.mail_labels where id::text like '${namespace}%')
  +(select count(*) from private.mail_raw_messages where id::text like '${namespace}%')
  +(select count(*) from private.mail_messages where id::text like '${namespace}%')
  +(select count(*) from public.notification_preferences where id::text like '${namespace}%')
  +(select count(*) from public.notifications where user_id::text like '${namespace}%')
  +(select count(*) from private.notification_batches where user_id::text like '${namespace}%'),
 'counts',json_build_array(${relations.map((r) => `(select count(*) from ${r})`).join(',')}));`;

export function assertSnapshot(snapshot, transportHash) {
  if (
    snapshot.owned !== 0 ||
    !Array.isArray(snapshot.counts) ||
    snapshot.counts.length !== relations.length ||
    !Array.isArray(snapshot.triggers)
  )
    throw new Error(
      'Held: synthetic namespace collision or incomplete catalog'
    );
  const transport = snapshot.triggers.filter(
    (t) =>
      t.rel === 'private.notification_batches' &&
      t.name === 'trigger_send_immediate_notification'
  );
  if (
    transport.length !== 1 ||
    transport[0].state !== 'O' ||
    transport[0].function !== 'public.trigger_immediate_notification_send' ||
    transport[0].body !== transportHash
  )
    throw new Error(
      'Held: expected immediate transport trigger/function hash mismatch'
    );
}

export async function executeFixture({
  sql,
  inspect,
  audit,
  expectedLedger,
  transportHash,
  writeAudit = () => {},
}) {
  await inspect();
  const ledger = JSON.parse(
    await sql(
      "select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations;"
    )
  );
  assertLedger(expectedLedger, ledger);
  const before = JSON.parse(await sql(snapshotSql));
  assertSnapshot(before, transportHash);
  writeAudit({ ledger, catalog: before });
  let failure;
  try {
    assertFixtureTap(await audit());
  } catch {
    failure = new Error('Mail full-schema fixture failed');
  }
  // Always use a fresh psql process, including on SQL/TAP failure.
  await inspect();
  const after = JSON.parse(await sql(snapshotSql));
  assertSnapshot(after, transportHash);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Mail rollback did not restore trigger/catalog/row counts');
  if (failure) throw failure;
  writeAudit({
    ledger,
    catalog: before,
    restored: after,
    strictAssertions: assertionCount,
  });
  return {
    schema: true,
    assertions: assertionCount,
    rollback: true,
    types: false,
    consumer: false,
    provider: false,
    device: false,
  };
}

export async function runMailFullSchema({
  env = process.env,
  exec = execFileSync,
} = {}) {
  const controlRoot = process.cwd();
  const fixture = readFileSync(path.join(controlRoot, fixturePath));
  assertFixturePolicy(fixture.toString('utf8'));
  const fixtureHash = hash(fixture);
  admitEnvironment(env, fixtureHash);
  const sourceRoot = realpathSync(env.MAIL_FULL_SCHEMA_SOURCE_ROOT);
  const childEnv = Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT']
      .filter((n) => env[n])
      .map((n) => [n, env[n]])
  );
  childEnv.SUPABASE_NO_UPDATE_NOTIFIER = '1';
  childEnv.SUPABASE_INTERNAL_IMAGE_REGISTRY = 'ghcr.io';
  const call = boundedExecutor(exec, childEnv, controlRoot);
  if (
    call('git', ['rev-parse', 'HEAD'], sourceRoot) !== sourceSha ||
    call('git', ['rev-parse', 'HEAD^{tree}'], sourceRoot) !== sourceTree ||
    call('git', ['status', '--porcelain'], sourceRoot)
  )
    throw new Error('Frozen source checkout identity/cleanliness mismatch');
  if (
    !readFileSync(path.join(controlRoot, fixturePath)).equals(
      Buffer.from(
        exec('git', ['show', `HEAD:${fixturePath}`], { cwd: controlRoot })
      )
    )
  )
    throw new Error('Control fixture must be committed and byte-identical');
  const trackedFiles = call(
    'git',
    ['ls-files', '-z', 'apps/database/supabase'],
    sourceRoot
  )
    .split('\0')
    .filter(Boolean);
  const migrations = trackedFiles
    .filter((f) => /\/migrations\/\d{14}_.+\.sql$/u.test(f))
    .sort();
  const expectedLedger = migrations.map((f) => path.basename(f).slice(0, 14));
  assertLedger(expectedLedger, expectedLedger);
  const transportSource = readFileSync(
    path.join(
      sourceRoot,
      'apps/database/supabase/migrations/20251202060000_add_immediate_notification_delivery.sql'
    ),
    'utf8'
  );
  const body =
    /FUNCTION public\.trigger_immediate_notification_send\(\)\s*RETURNS TRIGGER AS \$\$([\s\S]*?)\$\$/u.exec(
      transportSource
    )?.[1];
  if (!body)
    throw new Error('Expected frozen transport function source missing');
  const transportHash = createHash('md5').update(body).digest('hex');
  const identity = deriveIsolatedIdentity({
    headSha: sourceSha,
    repositoryPath: sourceRoot,
  });
  const names = () =>
    call('docker', ['ps', '-a', '--format', '{{.Names}}']).split('\n');
  if (hasProjectCollision(identity.projectId, names()))
    throw new Error('Owned isolated project collision');
  const networkId = env.MAIL_FULL_SCHEMA_NETWORK_ID;
  if (!/^[a-f0-9]{64}$/u.test(networkId))
    throw new Error('Immutable Docker network ID required');
  const network = () =>
    JSON.parse(call('docker', ['network', 'inspect', networkId]))[0];
  assertDockerApiVersion(
    call('docker', ['version', '--format', '{{.Server.APIVersion}}'])
  );
  const networkIds = (label) =>
    call('docker', [
      'network',
      'ls',
      '--no-trunc',
      '--filter',
      `label=${label}=${identity.projectId}`,
      '--format',
      '{{.ID}}',
    ])
      .split('\n')
      .filter(Boolean);
  const inspectNetworks = () => {
    assertNetworkInventory(
      networkIds(projectLabel),
      networkIds('tuturuuu.mail.project'),
      networkId
    );
    const value = network();
    assertOwnedNetwork(value, fixtureHash, identity.projectId);
    return value;
  };
  assertOwnedNetwork(network(), fixtureHash, identity.projectId, true);
  const networkName = inspectNetworks().Name;
  const binary = getBundledSupabaseBinaryPath(
    getSupabaseWrapperPath(path.join(sourceRoot, 'apps/database'))
  );
  if (
    !binary ||
    call(binary, ['--version'], sourceRoot) !== '2.117.0' ||
    !call(binary, ['start', '--help'], sourceRoot).includes('--network-id') ||
    !call(binary, ['db', 'reset', '--help'], sourceRoot).includes(
      '--network-id'
    )
  )
    throw new Error(
      'Held: pinned bundled CLI internal-network capability unproven'
    );
  const ports = await chooseAvailablePortBlock(identity);
  const metadata = await stageDisposableProject({
    repositoryRoot: sourceRoot,
    headSha: sourceSha,
    projectId: identity.projectId,
    basePort: ports.basePort,
    trackedFiles,
    typegenOutput: null,
    testPath: 'supabase/tests/mail-inbound-full-schema.sql',
  });
  let lifecycleStarted = false;
  try {
    for (const f of trackedFiles.filter((f) => !f.endsWith('/config.toml'))) {
      if (
        !readFileSync(path.join(sourceRoot, f)).equals(
          readFileSync(
            path.join(metadata.disposableRoot, f.replace('apps/database/', ''))
          )
        )
      )
        throw new Error('Frozen staged schema bytes mismatch');
    }
    const target = path.join(
      metadata.disposableRoot,
      'supabase/tests/mail-inbound-full-schema.sql'
    );
    copyFileSync(path.join(controlRoot, fixturePath), target);
    if (hash(readFileSync(target)) !== fixtureHash)
      throw new Error('Staged fixture hash mismatch');
    const ownedIds = () =>
      call('docker', [
        'ps',
        '-a',
        '--filter',
        `label=${projectLabel}=${identity.projectId}`,
        '--format',
        '{{.ID}}',
      ])
        .split('\n')
        .filter(Boolean);
    const inspect = async () => {
      const n = inspectNetworks();
      const ids = ownedIds();
      const containers = ids.length
        ? JSON.parse(call('docker', ['inspect', ...ids]))
        : [];
      assertProjectContainers(containers, networkId, identity.projectId);
      if (
        Object.keys(n.Containers ?? {}).some(
          (id) => !containers.some((c) => c.Id === id)
        )
      )
        throw new Error('Held: foreign container on fixture network');
    };
    const db = `supabase_db_${identity.projectId}`;
    const psql = (args) =>
      call(
        'docker',
        [
          'exec',
          db,
          'psql',
          '-X',
          '-A',
          '-t',
          '-q',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'supabase_admin',
          '-d',
          'postgres',
          ...args,
        ],
        controlRoot,
        120_000
      );
    const runner = async (_binary, args, cwd) => {
      if (args.includes('test')) {
        await inspect();
        call('docker', [
          'cp',
          target,
          `${db}:/tmp/mail-inbound-full-schema.sql`,
        ]);
        const result = await executeFixture({
          inspect,
          expectedLedger,
          transportHash,
          sql: (s) => psql(['-c', s]),
          audit: () =>
            psql([
              '-v',
              `mail_source_sha=${sourceSha}`,
              '-v',
              `mail_transport_hash=${transportHash}`,
              '-f',
              '/tmp/mail-inbound-full-schema.sql',
            ]),
          writeAudit: (proof) =>
            writeFileSync(
              path.join(
                realpathSync(env.RUNNER_TEMP),
                'mail-full-schema-proof.json'
              ),
              `${JSON.stringify(
                { sourceSha, sourceTree, fixtureHash, ...proof },
                null,
                2
              )}\n`,
              { flag: 'w', mode: 0o600 }
            ),
        });
        console.log(
          JSON.stringify({ sourceSha, sourceTree, fixtureHash, ...result })
        );
        return { code: 0 };
      }
      if (!args.includes('stop')) inspectNetworks();
      const extra = args.includes('start') ? ['--exclude', excluded] : [];
      let code = 0;
      try {
        call(
          binary,
          ['--network-id', networkName, ...args, ...extra],
          cwd,
          args.includes('stop') ? 120_000 : 900_000
        );
      } catch {
        code = 1;
      }
      if (args.includes('stop')) {
        // Do not remove leftover/foreign containers. Root owns recovery and network removal.
        try {
          assertDrained(
            ownedIds(),
            names(),
            inspectNetworks(),
            identity.projectId
          );
        } catch {
          code = 1;
        }
      } else if (!code) await inspect();
      return { code };
    };
    lifecycleStarted = true;
    const code = await runIsolatedLifecycle({
      binaryPath: binary,
      metadata,
      runner,
      stderr: {
        write: () =>
          console.error(
            'Mail qualification lifecycle failed; scoped cleanup evidence required'
          ),
      },
    });
    console.log(
      JSON.stringify({
        sourceSha,
        fixtureHash,
        lifecycleCode: code,
        networkRemoval: 'root-required',
        cleanupAcknowledged: false,
        delivery: false,
      })
    );
    return code;
  } finally {
    if (!lifecycleStarted) await removeDisposableRoot(metadata.disposableRoot);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await runMailFullSchema();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
