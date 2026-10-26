import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const { parse } = createRequire(import.meta.url)('acorn');
const repository = fileURLToPath(new URL('../../', import.meta.url));
const entry = 'scripts/ci/apps-native-runtime.test.mjs';

test('Apps evidence packaging runs in a cold checkout without root YAML packages', async (t) => {
  const cold = await realpath(
    await mkdtemp(join(tmpdir(), 'apps-cold-resolution-'))
  );
  t.after(() => rm(cold, { recursive: true, force: true }));
  const copied = new Set();
  async function copyModule(path) {
    if (copied.has(path)) return;
    copied.add(path);
    const name = relative(repository, path);
    assert.ok(
      name && !name.startsWith('..'),
      'Fixture module must belong to this checkout'
    );
    const target = join(cold, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(path, target);
    const source = await readFile(path, 'utf8');
    const module = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    for (const node of module.body) {
      if (!node.source) continue;
      const specifier = node.source.value;
      if (specifier.startsWith('.'))
        await copyModule(resolve(dirname(path), specifier));
      else
        assert.ok(
          specifier.startsWith('node:'),
          'Cold fixture cannot depend on installed packages'
        );
    }
  }
  await copyModule(join(repository, entry));
  await copyModule(join(repository, 'scripts/ci/workflow-yaml-test-helper.js'));
  await copyModule(join(repository, 'scripts/ci/pr-label-gate.js'));
  const workflow = '.github/workflows/apps-cloudflare.yaml';
  await mkdir(join(cold, '.github/workflows'), { recursive: true });
  await copyFile(join(repository, workflow), join(cold, workflow));
  assert.equal(existsSync(join(cold, 'node_modules')), false);
  // Preserve resource-queue ancestry for the existing helper's bounded Bun call.
  const env = { PATH: process.env.PATH, NODE_PATH: '', NODE_OPTIONS: '' };
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('TTR_RESOURCE')) env[name] = value;
  }
  const result = spawnSync(
    process.execPath,
    [
      '--no-global-search-paths',
      '--test',
      '--test-name-pattern=both CI evidence pack steps retain the complete hidden inventory',
      join(cold, entry),
    ],
    { cwd: cold, env, encoding: 'utf8', timeout: 30000 }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /both CI evidence pack steps retain the complete hidden inventory/
  );
  assert.doesNotMatch(result.stdout + result.stderr, /Cannot find module/);
});
