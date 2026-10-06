import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'a'.repeat(40);
const name = 'Tuturuuu-linux-x64.deb';
const sha256 = createHash('sha256').update('synthetic package').digest('hex');
const version = (
  await readFile(join(root, 'apps/mobile/pubspec.yaml'), 'utf8')
).match(/^version: (\d+\.\d+\.\d+)\+/m)[1];
const tag = `desktop-v${version}-123`;

async function runPublication(change = {}, view = { databaseId: 456 }) {
  const temp = await mkdtemp(join(tmpdir(), 'desktop-draft-test-'));
  try {
    const directory = join(temp, 'desktop-artifacts');
    await mkdir(directory);
    await writeFile(join(directory, name), 'synthetic package');
    await writeFile(
      join(directory, 'verified-linux.json'),
      JSON.stringify({
        platform: 'linux',
        name,
        sha256,
        source,
        run: '123',
        verification: 'deb-package-verified',
      })
    );
    const fixture = {
      view,
      release: {
        id: 456,
        tag_name: tag,
        target_commitish: source,
        draft: true,
        prerelease: true,
        assets: [{ name, state: 'uploaded', digest: `sha256:${sha256}` }],
        ...change,
      },
    };
    await writeFile(join(temp, 'fixture.json'), JSON.stringify(fixture));
    await writeFile(
      join(temp, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const fixture = JSON.parse(fs.readFileSync(process.env.TEST_FIXTURE, 'utf8'));
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'release' && args[1] === 'create') process.exit(0);
if (args[0] === 'release' && args[1] === 'view') { console.log(JSON.stringify(fixture.view)); process.exit(0); }
if (args[0] === 'api' && args[1] === 'repos/tutur3u/platform/releases/456') { console.log(JSON.stringify(fixture.release)); process.exit(0); }
if (args[0] === 'release' && args[1] === 'edit') process.exit(0);
console.error('gh: Not Found (HTTP 404)'); process.exit(1);
`,
      { mode: 0o700 }
    );
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts/desktop-deployment/publish.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${temp}:${process.env.PATH}`,
          RUNNER_TEMP: temp,
          GITHUB_REF: 'refs/heads/production',
          GITHUB_REPOSITORY: 'tutur3u/platform',
          GITHUB_SHA: source,
          GITHUB_RUN_ID: '123',
          DESKTOP_BETA_PLATFORMS: 'linux',
          TEST_FIXTURE: join(temp, 'fixture.json'),
          TEST_CALLS: join(temp, 'calls.jsonl'),
        },
      }
    );
    const calls = (await readFile(join(temp, 'calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    return { result, calls };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test('actual publisher verifies a draft by database ID when tag REST lookup is 404', async () => {
  const { result, calls } = await runPublication();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    calls.some(
      (args) => args[0] === 'release' && args[1] === 'view' && args[2] === tag
    )
  );
  assert.ok(
    calls.some(
      (args) =>
        args[0] === 'api' && args[1] === 'repos/tutur3u/platform/releases/456'
    )
  );
  assert.ok(
    !calls.some((args) =>
      args.some((value) => value.includes('/releases/tags/'))
    )
  );
  assert.deepEqual(calls.at(-1), [
    'release',
    'edit',
    tag,
    '--repo',
    'tutur3u/platform',
    '--draft=false',
    '--prerelease',
    '--latest=false',
  ]);
  const create = calls[0];
  assert.ok(create.includes('--draft'));
  assert.ok(!create.includes('--clobber'));
});

test('wrong release identity or asset set never reaches publication', async () => {
  for (const change of [
    { id: 457 },
    { tag_name: 'another-release' },
    { target_commitish: 'b'.repeat(40) },
    { draft: false },
    { prerelease: false },
    { assets: [] },
    {
      assets: [{ name, state: 'uploaded', digest: `sha256:${'b'.repeat(64)}` }],
    },
    {
      assets: [
        {
          name: 'another-package',
          state: 'uploaded',
          digest: `sha256:${sha256}`,
        },
      ],
    },
    { assets: [{ name, state: 'new', digest: `sha256:${sha256}` }] },
    {
      assets: [
        { name, state: 'uploaded', digest: `sha256:${sha256}` },
        { name: 'unowned' },
      ],
    },
  ]) {
    const { result, calls } = await runPublication(change);
    assert.notEqual(result.status, 0, JSON.stringify(change));
    assert.ok(
      !calls.some((args) => args[0] === 'release' && args[1] === 'edit')
    );
  }
});

test('invalid database IDs are rejected before REST lookup or publication', async () => {
  for (const databaseId of [
    undefined,
    0,
    -1,
    '456',
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    '456/another',
  ]) {
    const { result, calls } = await runPublication({}, { databaseId });
    assert.notEqual(result.status, 0);
    assert.ok(!calls.some((args) => args[0] === 'api' || args[1] === 'edit'));
  }
});
