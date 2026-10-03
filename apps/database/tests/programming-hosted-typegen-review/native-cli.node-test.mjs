import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { getSupabaseBinaryPath } from '../../scripts/run-supabase.js';
import { createSyntheticCliContext } from './cli-environment.mjs';
import {
  CliProbeFailure,
  resolveHostedNativeCli,
  runCliProbe as runRawCliProbe,
  verificationFailureStatus,
} from './native-cli.mjs';
import { configureNativeCli, limits } from './proposal.mjs';

const contextRoot = mkdtempSync(
  path.join(os.tmpdir(), 'native-probe-environment-')
);
after(() => rmSync(contextRoot, { recursive: true, force: true }));
function runCliProbe(binary, args, options) {
  const context = createSyntheticCliContext({
    root: path.join(contextRoot, `isolated-${randomUUID()}`),
    nativeBinary: binary,
  });
  return runRawCliProbe(binary, args, { ...options, ...context });
}

async function installedFixture(
  t,
  {
    legacy = false,
    missing = false,
    machine = 62,
    executable = true,
    self = false,
  } = {}
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-cli-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shim = path.join(root, 'node_modules/supabase/dist/supabase.js');
  const wrapper = path.join(root, 'node_modules/.bin/supabase');
  const pkg = path.join(root, 'node_modules/@supabase/cli-linux-x64');
  const native = path.join(pkg, 'bin', legacy ? 'supabase-go' : 'supabase');
  await mkdir(path.dirname(shim), { recursive: true });
  await mkdir(path.dirname(wrapper), { recursive: true });
  await mkdir(path.dirname(native), { recursive: true });
  await writeFile(
    path.join(root, 'node_modules/supabase/package.json'),
    JSON.stringify({ name: 'supabase', bin: { supabase: 'dist/supabase.js' } })
  );
  await writeFile(
    path.join(pkg, 'package.json'),
    JSON.stringify({ name: '@supabase/cli-linux-x64' })
  );
  await writeFile(shim, '#!/usr/bin/env node\n');
  await symlink(shim, wrapper);
  if (!missing) {
    const header = Buffer.alloc(20);
    header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    header.writeUInt16LE(2, 16);
    header.writeUInt16LE(machine, 18);
    if (self) await symlink(shim, native);
    else {
      await writeFile(native, header);
      await chmod(native, executable ? 0o755 : 0o644);
    }
  }
  return { wrapper, native, shim };
}
const resolve = (wrapper) =>
  resolveHostedNativeCli(wrapper, { platform: 'linux', arch: 'x64' });
test('actual existing bundled resolver resolves npm .bin shim to native ELF; helpers inherit native override', async (t) => {
  const fixture = await installedFixture(t);
  const env = { SUPABASE_CLI_BINARY_OVERRIDE: fixture.wrapper };
  assert.equal(
    configureNativeCli({ env, resolver: resolve }),
    realpathSync(fixture.native)
  );
  assert.equal(
    getSupabaseBinaryPath('/unused', { env }),
    realpathSync(fixture.native)
  );
  assert.notEqual(env.SUPABASE_CLI_BINARY_OVERRIDE, fixture.wrapper);
  assert.equal(limits.commandMs, 5000);
});
for (const [name, options] of [
  ['missing native', { missing: true }],
  ['legacy sidecar', { legacy: true }],
  ['self reference', { self: true }],
  ['wrong architecture', { machine: 183 }],
  ['non-executable', { executable: false }],
]) {
  test(`native admission rejects ${name} without execution or path diagnostics`, async (t) => {
    const { wrapper } = await installedFixture(t, options);
    assert.throws(
      () => resolve(wrapper),
      (error) =>
        error instanceof CliProbeFailure &&
        verificationFailureStatus('prepare', error) ===
          'Programming verification phase=cli-resolve outcome=unavailable'
    );
  });
}
test('native admission rejects interpreter files and unsupported platform', async (t) => {
  const { wrapper, native } = await installedFixture(t);
  await writeFile(native, '#!/bin/sh\necho should-never-execute\n');
  assert.throws(() => resolve(wrapper), CliProbeFailure);
  assert.throws(
    () => resolveHostedNativeCli(wrapper, { platform: 'darwin' }),
    CliProbeFailure
  );
});
for (const [phase, args] of [
  ['cli-version', ['--version']],
  ['cli-services', ['services', '-o', 'json']],
]) {
  test(`${phase} probe passes literal argv and removes recursive override from child environment`, async () => {
    const text = await runCliProbe(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'console.log(JSON.stringify({args:process.argv.slice(1),override:process.env.SUPABASE_CLI_BINARY_OVERRIDE??null}))',
        '--',
        ...args,
      ],
      {
        phase,
        timeoutMs: 2000,
      }
    );
    assert.deepEqual(JSON.parse(text), { args, override: null });
  });
}
for (const stream of ['stdout', 'stderr']) {
  test(`probe bounds combined output including ${stream}; raw text never enters error status`, async () => {
    await assert.rejects(
      runCliProbe(
        process.execPath,
        [
          '-e',
          `process.${stream}.write('PRIVATE-SYNTHETIC-TEXT'.repeat(500));setInterval(()=>{},1000)`,
        ],
        { phase: 'cli-services', timeoutMs: 2000, maxOutputBytes: 128 }
      ),
      (error) =>
        verificationFailureStatus('prepare', error) ===
          'Programming verification phase=cli-services outcome=output-limit' &&
        !error.message.includes('PRIVATE')
    );
  });
}
test('probe output cap applies across stdout and stderr together', async () => {
  await assert.rejects(
    runCliProbe(
      process.execPath,
      [
        '-e',
        'process.stdout.write("a".repeat(80));process.stderr.write("b".repeat(80))',
      ],
      { phase: 'cli-version', timeoutMs: 2000, maxOutputBytes: 128 }
    ),
    (error) => error.outcome === 'output-limit'
  );
});
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
for (const mode of ['timeout', 'interruption', 'success']) {
  test(`probe owns descendants on ${mode}`, async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'probe-group-contract-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const marker = path.join(root, 'pids.json');
    const fixture = path.join(root, 'fake-probe.mjs');
    await writeFile(
      fixture,
      `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.once('spawn',()=>{writeFileSync(process.argv[2],JSON.stringify([process.pid,child.pid]));${mode === 'success' ? "process.stdout.write('synthetic');process.exit(0)" : 'setInterval(()=>{},1000)'}});`
    );
    const signals = new EventEmitter();
    let interruptTimer;
    let pids = [];
    try {
      const promise = runCliProbe(process.execPath, [fixture, marker], {
        phase: 'cli-version',
        timeoutMs: mode === 'timeout' ? 500 : 2000,
        signalSource: signals,
      });
      if (mode === 'interruption')
        interruptTimer = setInterval(() => {
          if (existsSync(marker)) signals.emit('SIGTERM');
        }, 20);
      if (mode === 'success') assert.equal(await promise, 'synthetic');
      else
        await assert.rejects(
          promise,
          (error) =>
            error.outcome === (mode === 'timeout' ? 'timeout' : 'interrupted')
        );
      pids = JSON.parse(await readFile(marker, 'utf8'));
      for (let i = 0; i < 100 && pids.some(alive); i++) await delay(20);
      assert.deepEqual(pids.filter(alive), []);
      assert.equal(signals.listenerCount('SIGTERM'), 0);
      assert.equal(signals.listenerCount('SIGINT'), 0);
    } finally {
      clearInterval(interruptTimer);
      if (!pids.length && existsSync(marker))
        pids = JSON.parse(await readFile(marker, 'utf8'));
      for (const pid of pids) if (alive(pid)) process.kill(pid, 'SIGKILL');
    }
  });
}
test('spawn failures and generic errors emit only allowlisted phase/outcome, never path/env/raw error text', async () => {
  await assert.rejects(
    runCliProbe('/synthetic/missing/private-path', [], {
      phase: 'cli-version',
      timeoutMs: 1000,
    }),
    (error) =>
      verificationFailureStatus('prepare', error) ===
      'Programming verification phase=cli-version outcome=failed'
  );
  assert.equal(
    verificationFailureStatus(
      'private-mode',
      new Error('private env stdout stderr types hashes provenance')
    ),
    'Programming verification phase=prepare outcome=failed'
  );
  const error = new CliProbeFailure('cli-services', 'timeout');
  error.phase = 'private-phase';
  error.outcome = 'private-output';
  assert.equal(
    verificationFailureStatus('run', error),
    'Programming verification phase=run outcome=failed'
  );
});
