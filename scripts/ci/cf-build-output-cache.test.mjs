// Proves the root `build` outputs make Turbo restore an emitted Cloudflare
// Build Output tree on a cache hit. The fixture task only writes known bytes;
// it never runs a real build, and Turbo runs with an isolated home, cache
// directory and local-only cache so no shared state or remote auth is touched.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TURBO = join(REPO_ROOT, 'node_modules/turbo/bin/turbo');
const ROOT_BUILD = JSON.parse(readFileSync(join(REPO_ROOT, 'turbo.json'))).tasks
  .build;
const CF_OUTPUT_GLOB = '.cloudflare/output/**';

// Known bytes for a cf Build Output tree, including a non-UTF-8 module.
const EMITTED = {
  'v0/config.json': JSON.stringify({ buildContext: { mode: 'production' } }),
  'v0/workers/default/worker.config.json': JSON.stringify({
    name: 'fixture-worker',
    manifest: { type: 'complete', mainModule: 'index.js' },
  }),
  'v0/workers/default/index.js': 'export default { fetch() {} };\n',
  'v0/workers/default/module.wasm': Buffer.from(
    Array.from({ length: 256 }, (_, byte) => byte)
  ).toString('base64'),
};
const BINARY = new Set(['v0/workers/default/module.wasm']);

function expectedBytes(file) {
  return Buffer.from(EMITTED[file], BINARY.has(file) ? 'base64' : 'utf8');
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(t, outputs) {
  const directory = mkdtempSync(join(tmpdir(), 'cf-build-output-cache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'repo');
  const app = join(root, 'apps/worker');
  const executions = join(directory, 'executions.log');
  writeJson(join(root, 'package.json'), {
    name: 'cf-build-output-cache-fixture',
    private: true,
    packageManager: 'npm@10.9.0',
    workspaces: ['apps/*'],
  });
  writeJson(join(root, 'turbo.json'), {
    $schema: 'https://turborepo.com/schema.json',
    tasks: { emit: { outputs } },
  });
  writeJson(join(app, 'package.json'), {
    name: 'fixture-worker',
    private: true,
    scripts: { emit: 'node emit.mjs' },
  });
  // The task materializes known bytes, a dist/ file that keeps a cache entry
  // under either output list, and a non-output sibling under .cloudflare/. It
  // records each real execution outside the fixture repo.
  writeFileSync(
    join(app, 'emit.mjs'),
    [
      "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      `const emitted = ${JSON.stringify(EMITTED)};`,
      `const binary = new Set(${JSON.stringify([...BINARY])});`,
      'for (const [file, value] of Object.entries(emitted)) {',
      "  const target = join('.cloudflare/output', file);",
      '  mkdirSync(dirname(target), { recursive: true });',
      "  writeFileSync(target, Buffer.from(value, binary.has(file) ? 'base64' : 'utf8'));",
      '}',
      "mkdirSync('dist', { recursive: true });",
      "writeFileSync('dist/client.txt', 'client');",
      "mkdirSync('.cloudflare/state', { recursive: true });",
      "writeFileSync('.cloudflare/state/local.json', '{}');",
      `appendFileSync(${JSON.stringify(executions)}, 'executed\\n');`,
      '',
    ].join('\n')
  );
  // Like the real repo, emitted trees and Turbo logs are git-ignored; without
  // a git index Turbo would hash .turbo/turbo-emit.log and never hit.
  writeFileSync(join(root, '.gitignore'), '.turbo\n.cloudflare/\ndist/\n');
  const home = join(directory, 'home');
  mkdirSync(home);
  const env = isolatedEnv(home);
  const git = spawnSync('git', ['init', '--quiet'], { cwd: root, env });
  assert.equal(git.status, 0, String(git.stderr));
  return { app, cache: join(directory, 'turbo-cache'), env, executions, root };
}

// Only the minimum host environment; no TURBO_TOKEN/TEAM/API, user Turbo
// config or user git config reaches the subprocesses.
function isolatedEnv(home) {
  return {
    PATH: process.env.PATH,
    HOME: home,
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_CONFIG_HOME: join(home, '.config'),
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(home, '.gitconfig'),
    DO_NOT_TRACK: '1',
    TURBO_TELEMETRY_DISABLED: '1',
    TURBO_NO_UPDATE_NOTIFIER: '1',
  };
}

function runEmit({ cache, env, root }) {
  const result = spawnSync(
    process.execPath,
    [
      TURBO,
      'run',
      'emit',
      '--skip-infer',
      '--no-update-notifier',
      '--cache=local:rw',
      `--cache-dir=${cache}`,
      '--concurrency=1',
      '--output-logs=full',
      '--log-order=grouped',
    ],
    { cwd: root, env, encoding: 'utf8', timeout: 60_000 }
  );
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  return output;
}

function readTree(directory) {
  if (!existsSync(directory)) return {};
  const tree = {};
  for (const entry of readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    tree[relative(directory, file).split('\\').join('/')] = readFileSync(file);
  }
  return tree;
}

function executionCount(file) {
  return readFileSync(file, 'utf8').trim().split('\n').length;
}

function missThenHit(t, outputs) {
  const project = fixture(t, outputs);
  const output = join(project.app, '.cloudflare/output');

  assert.match(runEmit(project), /cache miss, executing/);
  assert.equal(executionCount(project.executions), 1);
  const emitted = readTree(output);
  assert.deepEqual(Object.keys(emitted).sort(), Object.keys(EMITTED).sort());
  for (const file of Object.keys(EMITTED))
    assert.deepEqual(emitted[file], expectedBytes(file), file);

  for (const emittedDir of ['.cloudflare', 'dist'])
    rmSync(join(project.app, emittedDir), { recursive: true, force: true });
  assert.match(runEmit(project), /cache hit, replaying logs/);
  assert.equal(executionCount(project.executions), 1, 'hit must not execute');
  assert.equal(
    readFileSync(join(project.app, 'dist/client.txt'), 'utf8'),
    'client'
  );
  return { emitted, project, restored: readTree(output) };
}

test('root build outputs include the cf Build Output tree only', () => {
  assert.ok(ROOT_BUILD.outputs.includes(CF_OUTPUT_GLOB));
  assert.ok(
    !ROOT_BUILD.outputs.some((glob) =>
      /^\.cloudflare\/(?!output\/)/.test(glob)
    ),
    'do not cache non-output .cloudflare state'
  );
});

test('native cf Worker apps inherit the root build outputs', () => {
  const apps = readdirSync(join(REPO_ROOT, 'apps')).filter((name) => {
    const vite = join(REPO_ROOT, 'apps', name, 'vite.config.ts');
    // tanstack-web is a paused runtime; its build is not part of this gate.
    return (
      name !== 'tanstack-web' &&
      existsSync(vite) &&
      readFileSync(vite, 'utf8').includes('@cloudflare/vite-plugin')
    );
  });
  assert.ok(apps.length >= 3, `native Workers discovered: ${apps}`);
  for (const name of apps) {
    const config = join(REPO_ROOT, 'apps', name, 'turbo.json');
    if (!existsSync(config)) continue;
    const outputs = JSON.parse(readFileSync(config)).tasks?.build?.outputs;
    assert.ok(
      outputs === undefined || outputs.includes('$TURBO_EXTENDS$'),
      `${name} must not replace the root build outputs`
    );
  }
});

test('a Turbo cache hit restores the cf Build Output byte-for-byte', (t) => {
  const { emitted, project, restored } = missThenHit(t, ROOT_BUILD.outputs);
  assert.deepEqual(restored, emitted);
  for (const file of Object.keys(EMITTED))
    assert.deepEqual(restored[file], expectedBytes(file), file);
  assert.ok(
    !existsSync(join(project.app, '.cloudflare/state/local.json')),
    'non-output .cloudflare state is not cached'
  );
});

test('negative control: the previous outputs replay logs without the tree', (t) => {
  const previous = ROOT_BUILD.outputs.filter((glob) => glob !== CF_OUTPUT_GLOB);
  const { restored } = missThenHit(t, previous);
  assert.deepEqual(restored, {});
});
