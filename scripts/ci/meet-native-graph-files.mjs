import assert from 'node:assert/strict';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { readFileSnapshot, readRegularFile } from '../safe-fs.js';
import { sealMeetApp } from './meet-native-inventory.mjs';
import {
  admitRegistry,
  assertMeetOriginal,
  closed,
  hash,
  within,
} from './meet-native-profile.mjs';
import {
  captureDiagnosticSnapshot,
  diagnosticError,
  persistFinalization,
} from './native-wrangler-evidence.mjs';
import {
  assertTempContents,
  sealArtifact,
} from './native-wrangler-runtime.mjs';

async function copySealed(plan, target) {
  const { root, seal } = plan;
  await mkdir(target, { mode: 0o700 });
  for (const name of Object.keys(seal)) {
    const destination = within(target, join(target, name));
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    if (name.endsWith('/'))
      await mkdir(destination, { recursive: true, mode: 0o700 });
    else await copyFile(within(root, join(root, name)), destination);
  }
  assert.deepEqual(
    await sealMeetApp(target, plan),
    seal,
    'Graph copy mutation'
  );
}

export async function prepareMeetGraph(plan, context) {
  await assertMeetOriginal(plan);
  await assertTempContents(context.tempRoot);
  const scratch = await realpath(
    await mkdtemp(join(context.tempRoot, 'meet-graph-'))
  );
  const appRoot = join(scratch, 'app'),
    probeRoot = join(scratch, 'probe');
  const registry = join(scratch, 'registry');
  await copySealed(plan, appRoot);
  await mkdir(probeRoot, { mode: 0o700 });
  await mkdir(registry, { mode: 0o700 });
  await copyFile(plan.probePath, join(probeRoot, 'probe.mjs'));
  await writeFile(
    join(probeRoot, 'wrangler.json'),
    JSON.stringify(plan.probeConfig),
    { flag: 'wx' }
  );
  const evidenceRoot = join(scratch, 'source-evidence');
  await mkdir(evidenceRoot);
  await copyFile(plan.manifestPath, join(evidenceRoot, 'meet-artifact.json'));
  await copyFile(plan.pointerPath, join(evidenceRoot, 'deploy-pointer.json'));
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const roles = {
    app: {
      root: appRoot,
      config: join(appRoot, plan.configRelative),
      seal: plan.seal,
    },
    probe: {
      root: probeRoot,
      config: join(probeRoot, 'wrangler.json'),
      seal: await sealArtifact(probeRoot),
    },
  };
  await assertMeetOriginal(plan);
  return {
    ...context,
    scratch,
    registry,
    envFile,
    roles,
    evidenceRoot,
    evidenceSeal: await sealArtifact(evidenceRoot),
    top: ['app', 'probe', 'registry', 'source-evidence', 'synthetic.env'],
  };
}

// Ignore exactly the SDK work directory beside each admitted config. Inventory it
// independently; no shared ancestor or app module directory is excluded.
export async function inventoryRole(role) {
  const ignored = relative(role.root, join(dirname(role.config), '.wrangler'));
  const files = {};
  async function walk(dir) {
    assert.equal(await realpath(dir), dir);
    for (const item of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const path = join(dir, item.name),
        name = relative(role.root, path);
      if (name === ignored) continue;
      assert.ok(!item.name.startsWith('.'), 'Unexpected hidden graph entry');
      if (item.isDirectory()) {
        files[`${name}/`] = null;
        await walk(path);
      } else {
        assert.ok(item.isFile(), 'Graph links/special files forbidden');
        files[name] = hash(await readRegularFile(path));
      }
    }
  }
  await walk(role.root);
  return files;
}

async function workdirInventory(path) {
  const result = [];
  async function walk(path, name) {
    const info = await lstat(path);
    assert.ok(
      info.isDirectory() || info.isFile(),
      'SDK workdir link/special entry'
    );
    result.push({
      name,
      type: info.isDirectory() ? 'directory' : 'file',
      hash: info.isFile() ? hash(await readRegularFile(path)) : null,
    });
    if (info.isDirectory())
      for (const child of (await readdir(path)).sort())
        await walk(join(path, child), `${name}/${child}`);
  }
  try {
    await walk(path, '');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return result;
}

export async function assertMeetCopy(plan, prepared, beforeLoad = false) {
  closed(prepared.roles, ['app', 'probe'], 'Closed graph roles');
  for (const [name, role] of Object.entries(prepared.roles)) {
    closed(role, ['root', 'config', 'seal'], 'Closed role root');
    assert.equal(role.root, join(prepared.scratch, name));
    assert.equal(
      role.config,
      name === 'app'
        ? join(role.root, plan.configRelative)
        : join(role.root, 'wrangler.json')
    );
  }
  assert.equal(prepared.registry, join(prepared.scratch, 'registry'));
  assert.equal(await realpath(prepared.registry), prepared.registry);
  assert.equal(
    prepared.evidenceRoot,
    join(prepared.scratch, 'source-evidence')
  );
  assert.deepEqual(
    (await readdir(prepared.scratch)).sort(),
    [...prepared.top].sort(),
    'Graph scratch inventory'
  );
  assert.equal(await readFile(prepared.envFile, 'utf8'), '');
  assert.deepEqual(
    await sealArtifact(prepared.evidenceRoot),
    prepared.evidenceSeal
  );
  assert.equal(
    hash(await readFile(join(prepared.evidenceRoot, 'meet-artifact.json'))),
    plan.manifestHash
  );
  assert.equal(
    hash(await readFile(join(prepared.evidenceRoot, 'deploy-pointer.json'))),
    plan.pointerHash
  );
  for (const [name, role] of Object.entries(prepared.roles)) {
    assert.deepEqual(
      await (name === 'app'
        ? sealMeetApp(role.root, { ...plan, allowSdkWorkingDir: !beforeLoad })
        : beforeLoad
          ? sealArtifact(role.root)
          : inventoryRole(role)),
      role.seal,
      'Copied role changed'
    );
  }
  assert.equal(
    hash(await readFile(join(prepared.roles.probe.root, 'probe.mjs'))),
    plan.probeHash
  );
  assert.deepEqual(
    JSON.parse(await readFile(prepared.roles.app.config)),
    plan.config
  );
  assert.deepEqual(
    JSON.parse(await readFile(prepared.roles.probe.config)),
    plan.probeConfig
  );
}

export async function readMeetRegistry(prepared, startedAt) {
  const records = {};
  for (const name of await readdir(prepared.registry)) {
    const { data, stat: info } = await readFileSnapshot(
      join(prepared.registry, name),
      { maxBytes: 4096 }
    );
    assert.ok(
      info.isFile() && !info.isSymbolicLink(),
      'Registry entry must be regular'
    );
    assert.ok(info.size <= 4096, 'Registry record bound');
    records[name] = {
      value: JSON.parse(data),
      mtimeMs: info.mtimeMs,
    };
  }
  admitRegistry(records, startedAt);
  return records;
}

export function createMeetFinalizer(plan, prepared, remove = rm) {
  let completion;
  return (gates = [], records = {}) =>
    (completion ??= (async () => {
      const errors = [...gates],
        phases = {},
        inventories = {};
      async function check(name, run) {
        try {
          await run();
          phases[name] = { ok: true };
        } catch (error) {
          errors.push(error);
          phases[name] = { ok: false, error };
        }
      }
      await check('residual', () =>
        assertTempContents(prepared.tempRoot, [basename(prepared.scratch)])
      );
      await check('originalSeal', () => assertMeetOriginal(plan));
      await check('copySeal', () => assertMeetCopy(plan, prepared));
      await check('registryEmpty', () => assertTempContents(prepared.registry));
      for (const [name, role] of Object.entries(prepared.roles))
        await check(`${name}Workdir`, async () => {
          inventories[name] = await workdirInventory(
            join(dirname(role.config), '.wrangler')
          );
        });
      await check('foreign', async () =>
        assert.equal(
          await readFile(prepared.foreignPath, 'utf8'),
          prepared.foreignValue
        )
      );
      let snapshot;
      await check('snapshot', async () => {
        snapshot = await captureDiagnosticSnapshot(prepared, {
          ...records,
          inventories,
          gates: gates.map(diagnosticError),
          phases: Object.fromEntries(
            Object.entries(phases).map(([name, phase]) => [
              name,
              { ok: phase.ok, error: diagnosticError(phase.error) },
            ])
          ),
        });
      });
      if (!errors.length)
        await check('removal', async () => {
          await remove(prepared.scratch, { recursive: true });
          await assert.rejects(realpath(prepared.scratch), { code: 'ENOENT' });
          await assertTempContents(prepared.tempRoot);
          assert.equal(
            await readFile(prepared.foreignPath, 'utf8'),
            prepared.foreignValue
          );
        });
      const result = { phases, errors, snapshot };
      await persistFinalization(prepared, result, {
        ...records,
        internalCleanup: 'UNKNOWN',
        descendantClosure: 'UNKNOWN',
      });
      return result;
    })());
}
