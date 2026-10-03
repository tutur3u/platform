import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSyntheticCliEnvironment,
  createSyntheticCliContext,
} from './cli-environment.mjs';
import { runOwnedProcess } from './process-group.mjs';
import { syntheticCliContext } from './proposal.mjs';

test('actual proposal contexts do not reuse lifecycle HOME/config/temp directories', async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'context-owner-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const options = { outputRoot: path.join(base, 'proof') };
  const lifecycle = syntheticCliContext(process.execPath, base, options);
  await writeFile(
    path.join(lifecycle.env.DOCKER_CONFIG, 'synthetic.json'),
    '{}'
  );
  await writeFile(
    path.join(lifecycle.env.SUPABASE_HOME, 'synthetic-cache'),
    'synthetic'
  );
  const inventory = syntheticCliContext(process.execPath, undefined, options);
  const policy = syntheticCliContext(process.execPath, undefined, options);
  for (const key of [
    'HOME',
    'SUPABASE_HOME',
    'DOCKER_CONFIG',
    'XDG_CONFIG_HOME',
    'TMPDIR',
  ]) {
    assert.notEqual(inventory.env[key], lifecycle.env[key]);
    assert.notEqual(policy.env[key], inventory.env[key]);
  }
  assertSyntheticCliEnvironment(inventory.env, inventory.cwd);
  assertSyntheticCliEnvironment(policy.env, policy.cwd);
});

test('private temporary root is revalidated for permissions', async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'temp-admission-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const context = createSyntheticCliContext({
    root: path.join(base, 'private'),
    nativeBinary: process.execPath,
  });
  await chmod(context.env.TMPDIR, 0o755);
  assert.throws(() => assertSyntheticCliEnvironment(context.env, context.cwd));
});

test('async monitors are serialized and a rejected monitor aborts owned helper', {
  timeout: 4000,
}, async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'async-monitor-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  let pid;
  let active = 0;
  let maximum = 0;
  await assert.rejects(
    runOwnedProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      timeoutMs: 2000,
      intervalMs: 20,
      onSpawn: (ownedPid) => {
        pid = ownedPid;
      },
      onTick: async () => {
        maximum = Math.max(maximum, ++active);
        await new Promise((resolve) => setTimeout(resolve, 80));
        active--;
        throw new Error('synthetic policy failure');
      },
    }),
    /synthetic policy failure/
  );
  assert.equal(maximum, 1);
  assert(Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
