import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const entry = 'scripts/ci/calendar-ssr-diagnostics.test.mjs';

test('Calendar workflow packaging assertions run cold in owning CI and root Node discovery', async (t) => {
  const cold = await realpath(
    await mkdtemp(join(tmpdir(), 'calendar-cold-resolution-'))
  );
  t.after(() => rm(cold, { recursive: true, force: true }));
  // Copy real suppliers and the actual workflow; no package install or YAML stub.
  for (const name of [
    entry,
    'scripts/safe-fs.js',
    'scripts/ci/calendar-response-diagnostics.mjs',
    'scripts/ci/calendar-ssr-capture.mjs',
    'apps/calendar/src/runtime/ssr-diagnostics.ts',
    'scripts/ci/workflow-yaml-test-helper.js',
    'scripts/ci/pr-label-gate.js',
    '.github/workflows/mail-calendar-tasks-builds.yaml',
  ]) {
    await mkdir(dirname(join(cold, name)), { recursive: true });
    await copyFile(join(repository, name), join(cold, name));
  }
  assert.equal(existsSync(join(cold, 'node_modules')), false);
  const env = { PATH: process.env.PATH, NODE_PATH: '', NODE_OPTIONS: '' };
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('TTR_RESOURCE')) env[name] = value;
  }
  // Owning Calendar imports this suite from its artifact gate. Root shards
  // discover the same .test.mjs directly; exercise both real entry modes.
  for (const mode of ['owning-calendar', 'root-node']) {
    await t.test(mode, () => {
      const args =
        mode === 'owning-calendar'
          ? ['--input-type=module', '-e', `await import('./${entry}')`]
          : ['--test', '--test-concurrency=1', join(cold, entry)];
      const result = spawnSync(
        process.execPath,
        ['--no-global-search-paths', ...args],
        { cwd: cold, env, encoding: 'utf8', timeout: 30000 }
      );
      assert.equal(result.error, undefined, mode);
      assert.equal(result.signal, null, mode);
      assert.equal(
        result.status,
        0,
        `${mode}\n${result.stdout}${result.stderr}`
      );
      assert.match(
        result.stdout,
        /workflow uploads only the parent verified sanitized packet for each runtime job/
      );
      assert.doesNotMatch(result.stdout + result.stderr, /Cannot find module/);
    });
  }
});
