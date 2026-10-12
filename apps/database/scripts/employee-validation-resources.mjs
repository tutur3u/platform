import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { requireCommand, safeFailure } from './employee-validation-command.mjs';
import {
  containerInventory,
  daemonArguments,
  dockerPrefix,
  verifyBaseline,
} from './employee-validation-host.mjs';

export const projectLabel = 'com.supabase.cli.project';
const inspectFormat =
  '{{json .Id}}\n{{json .Name}}\n{{json .Config.Labels}}\n{{json .HostConfig}}\n{{json .State}}\n{{json .Image}}';
export function ownedInspection(
  stdout,
  name,
  project,
  id = null,
  token = null
) {
  const [foundId, foundName, labels, caps, state, image] = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.match(foundId, /^[a-f0-9]{64}$/u);
  assert.equal(foundName, `/${name}`, 'Wrong exact container name');
  assert.equal(labels?.[projectLabel], project, 'Wrong project owner');
  if (id) assert.equal(foundId, id, 'Container ID changed');
  if (token)
    assert.equal(
      labels?.['tuturuuu.employee.executor'],
      token,
      'Wrong executor owner'
    );
  return { id: foundId, caps, state, image };
}
function verifyCaps(caps, memory, pids) {
  assert.equal(caps.NanoCpus, 2e9, 'CPU cap absent');
  assert.equal(caps.Memory, memory, 'Memory cap absent');
  assert.equal(caps.MemorySwap, memory, 'Swap cap absent');
  assert.equal(caps.PidsLimit, pids, 'PID cap absent');
}
async function inspect(
  root,
  name,
  project,
  run,
  id = null,
  token = null,
  context = null
) {
  const dockerPrefix = daemonArguments(context);
  const result = await run(
    'docker',
    [...dockerPrefix, 'inspect', '--format', inspectFormat, id ?? name],
    root,
    { timeoutMs: 10000, phase: 'owned-inspection' }
  );
  return ownedInspection(result.stdout, name, project, id, token);
}
export async function capOwnedDatabase(
  root,
  metadata,
  postgresImage,
  run = requireCommand,
  context = null
) {
  try {
    const name = `supabase_db_${metadata.projectId}`;
    if (context) {
      await context.attest();
      const owned = await inspect(
        root,
        name,
        metadata.projectId,
        context.run,
        null,
        null,
        context
      );
      assert.equal(owned.image, postgresImage);
      verifyCaps(owned.caps, 4 * 1024 ** 3, 512);
      assert.equal(owned.state.Running, true);
      return { id: owned.id, capsVerified: true, firstCreateContract: true };
    }
    const before = await inspect(root, name, metadata.projectId, run);
    assert.equal(before.image, postgresImage, 'Wrong DB image identity');
    assert.equal(before.state.Running, true, 'DB is not running');
    await run(
      'docker',
      [
        ...dockerPrefix,
        'update',
        '--cpus',
        '2',
        '--memory',
        '4g',
        '--memory-swap',
        '4g',
        '--pids-limit',
        '512',
        before.id,
      ],
      root,
      { timeoutMs: 10000, phase: 'poststart-db-caps' }
    );
    const after = await inspect(root, name, metadata.projectId, run, before.id);
    verifyCaps(after.caps, 4 * 1024 ** 3, 512);
    assert.equal(after.state.Running, true);
    return { id: after.id, capsVerified: true };
  } catch (error) {
    error.receipt ??= safeFailure(error, 'poststart-db-caps');
    throw error;
  }
}
async function namedIds(root, name, run, context = null) {
  const dockerPrefix = daemonArguments(context);
  const result = await run(
    'docker',
    [
      ...dockerPrefix,
      'ps',
      '-a',
      '--filter',
      `name=^/${name}$`,
      '--no-trunc',
      '--format',
      '{{.ID}}',
    ],
    root,
    { timeoutMs: 10000, phase: 'executor-absence' }
  );
  return result.stdout.trim().split('\n').filter(Boolean);
}
export async function persistTypegenIntent(metadata, intent) {
  assert(
    path.isAbsolute(metadata.disposableRoot),
    'Owned recovery root required'
  );
  const target = path.join(
    metadata.disposableRoot,
    'employee-typegen-intent.json'
  );
  const handle = await open(target, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(intent, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await open(metadata.disposableRoot, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function ownedTypegen({
  root,
  metadata,
  image,
  run = requireCommand,
  token = randomUUID(),
  recordIntent = (intent) => persistTypegenIntent(metadata, intent),
  context = null,
  tracker = null,
}) {
  const dockerPrefix = daemonArguments(context);
  if (context) {
    run = tracker
      ? (cmd, args, cwd, settings) =>
          tracker.attempt(settings.phase, () =>
            context.run(cmd, args, cwd, settings)
          )
      : context.run;
    const workerIntent = recordIntent;
    recordIntent = async (intent) => {
      await context.persist('typegen-create-intent', intent);
      await context.step('worker-typegen-intent', () => workerIntent(intent));
    };
  }
  const name = `employee_types_${metadata.projectId}`;
  assert.match(metadata.projectId, /^[a-z0-9-]+$/u);
  assert.match(token, /^[a-zA-Z0-9-]+$/u);
  assert.match(image, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(
    await namedIds(root, name, run, context),
    [],
    'Existing executor must never be adopted'
  );
  const network = `supabase_network_${metadata.projectId}`;
  const net = await run(
    'docker',
    [
      ...dockerPrefix,
      'network',
      'inspect',
      '--format',
      '{{.Name}}\n{{json .Labels}}',
      network,
    ],
    root,
    { timeoutMs: 10000, phase: 'owned-network' }
  );
  const [netName, netLabels] = net.stdout.trim().split('\n');
  assert.equal(netName, network);
  assert.equal(JSON.parse(netLabels)?.[projectLabel], metadata.projectId);
  let primary = null,
    contents,
    id = null;
  const cleanup = {
    clientClosed: false,
    createAcknowledged: false,
    containerStopped: false,
    removed: false,
    absent: false,
    failure: null,
  };
  try {
    await recordIntent({
      version: 1,
      status: 'create-intent',
      name,
      projectId: metadata.projectId,
      token,
      imageId: image,
    });
    const created = await run(
      'docker',
      [
        ...dockerPrefix,
        'create',
        '--pull',
        'never',
        '--name',
        name,
        '--label',
        `${projectLabel}=${metadata.projectId}`,
        '--label',
        `tuturuuu.employee.executor=${token}`,
        '--network',
        network,
        '--cpus',
        '2',
        '--memory',
        '1g',
        '--memory-swap',
        '1g',
        '--pids-limit',
        '128',
        '--env',
        'PG_META_DB_URL=postgresql://postgres:postgres@db:5432/postgres',
        '--env',
        'PG_CONN_TIMEOUT_SECS=15',
        '--env',
        'PG_QUERY_TIMEOUT_SECS=45',
        '--env',
        'PG_META_GENERATE_TYPES=typescript',
        '--env',
        'PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public,private,storage',
        '--env',
        'PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true',
        image,
        'node',
        'dist/server/server.js',
      ],
      root,
      { timeoutMs: 10000, phase: 'typegen-create' }
    );
    assert.equal(created.code, 0, 'Create exit acknowledgement missing');
    assert.equal(created.clientClosed, true, 'Create client closure unproved');
    id = created.stdout.trim();
    assert.match(id, /^[a-f0-9]{64}$/u, 'Create ID acknowledgement missing');
    cleanup.createAcknowledged = true;
    const owned = await inspect(
      root,
      name,
      metadata.projectId,
      run,
      id,
      token,
      context
    );
    assert.equal(owned.image, image);
    verifyCaps(owned.caps, 1024 ** 3, 128);
    const generated = await run(
      'docker',
      [...dockerPrefix, 'start', '--attach', id],
      root,
      { timeoutMs: 60000, maxBytes: 64 * 1024 * 1024, phase: 'typegen-execute' }
    );
    cleanup.clientClosed = generated.clientClosed === true;
    const ended = await inspect(
      root,
      name,
      metadata.projectId,
      run,
      id,
      token,
      context
    );
    assert.equal(ended.state.Running, false, 'Executor server still running');
    assert.equal(ended.state.ExitCode, 0, 'Executor failed');
    assert(generated.stdout.trim().length > 0, 'Empty generated schema');
    contents = generated.stdout;
  } catch (error) {
    error.receipt ??= safeFailure(error, 'typegen-executor');
    primary = error;
    cleanup.clientClosed = error.receipt?.clientClosed ?? cleanup.clientClosed;
  } finally {
    try {
      const ids = await namedIds(root, name, run, context);
      assert(ids.length <= 1, 'Ambiguous executor identity');
      if (ids.length) {
        const owned = await inspect(
          root,
          name,
          metadata.projectId,
          run,
          ids[0],
          token,
          context
        );
        assert.equal(owned.image, image, 'Wrong executor image');
        if (id) assert.equal(owned.id, id);
        id = owned.id;
        // Removal only after exact name/project/token ownership, even on ambiguous create failure.
        await run('docker', [...dockerPrefix, 'rm', '--force', id], root, {
          timeoutMs: 10000,
          phase: 'typegen-remove',
        });
        cleanup.containerStopped = true;
        cleanup.removed = true;
      }
      assert.deepEqual(
        await namedIds(root, name, run, context),
        [],
        'Executor remains after removal'
      );
      cleanup.absent = true;
      assert(
        cleanup.createAcknowledged,
        'Typegen create acknowledgement missing; closure unproved'
      );
    } catch (error) {
      cleanup.failure = safeFailure(error, 'typegen-cleanup');
      primary ??= error;
    }
  }
  if (primary) {
    primary.cleanup = cleanup;
    throw primary;
  }
  return { contents, cleanup, id };
}
export async function proveCleanup(
  root,
  metadata,
  run = requireCommand,
  context = null
) {
  if (context)
    return context.close({
      projectId: metadata.projectId,
      root: metadata.disposableRoot,
    });
  const resources = {};
  for (const kind of ['container', 'network', 'volume']) {
    const args = kind === 'container' ? ['ps', '-a'] : [kind, 'ls'];
    const result = await run(
      'docker',
      [
        ...dockerPrefix,
        ...args,
        '--filter',
        `label=${projectLabel}=${metadata.projectId}`,
        '--format',
        kind === 'volume' ? '{{.Name}}' : '{{.ID}}',
      ],
      root,
      { timeoutMs: 10000, phase: `cleanup-${kind}-absence` }
    );
    assert.equal(result.stdout.trim(), '', 'Owned resources remain');
    resources[kind] = 'absent';
  }
  assert.deepEqual(
    await namedIds(root, `employee_types_${metadata.projectId}`, run),
    []
  );
  const inventory = await containerInventory(root, run);
  verifyBaseline(inventory);
  return {
    resources,
    typegen: 'absent',
    protected16: inventory,
    protectedBaselineUnchanged: true,
  };
}

export {
  getNativeLedgerFailure,
  MAX_NATIVE_LEDGER_RECORD_BYTES,
  persistNativeLedgerRecord,
} from './employee-validation-native-ledger.mjs';
