import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nextDesktopVersion } from './release-version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'a'.repeat(40);
const name = 'Tuturuuu-linux-x64.deb';
const sha256 = createHash('sha256').update('synthetic package').digest('hex');
const pubspec = await readFile(join(root, 'apps/mobile/pubspec.yaml'), 'utf8');
const pubspecVersion = pubspec.match(/^version: (\d+\.\d+\.\d+)\+/m)[1];
// A legacy run-suffixed beta already used the pubspec version.
const history = [`desktop-v${pubspecVersion}-99\t${'b'.repeat(40)}\tfalse`];
const version = nextDesktopVersion(pubspec, [`desktop-v${pubspecVersion}-99`]);
const tag = `desktop-v${version}`;

async function runPublication(
  change = {},
  view = { databaseId: 456 },
  platform = 'linux',
  verification = 'deb-package-verified',
  { desktopVersion = version, releases = history } = {}
) {
  const name =
    platform === 'windows'
      ? 'Tuturuuu-windows-x64-setup.exe'
      : 'Tuturuuu-linux-x64.deb';
  const temp = await mkdtemp(join(tmpdir(), 'desktop-draft-test-'));
  try {
    const directory = join(temp, 'desktop-artifacts');
    await mkdir(directory);
    await writeFile(join(directory, name), 'synthetic package');
    await writeFile(
      join(directory, `verified-${platform}.json`),
      JSON.stringify({
        platform,
        name,
        sha256,
        source,
        run: '123',
        verification,
      })
    );
    const fixture = {
      releases,
      view,
      release: {
        id: 456,
        tag_name: `desktop-v${desktopVersion}`,
        target_commitish: source,
        draft: true,
        prerelease: true,
        assets: [{ name, state: 'uploaded', digest: `sha256:${sha256}` }],
        ...change,
      },
    };
    await writeFile(join(temp, 'fixture.json'), JSON.stringify(fixture));
    // Synthetic source SHAs have no local history. Keep this subprocess fixture
    // offline instead of asking a partial clone to fetch these fake objects.
    await writeFile(join(temp, 'git'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    await writeFile(
      join(temp, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const fixture = JSON.parse(fs.readFileSync(process.env.TEST_FIXTURE, 'utf8'));
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'api' && args[1] === '--paginate') { for (const line of fixture.releases) console.log(line); process.exit(0); }
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
          DESKTOP_BETA_PLATFORMS: platform,
          DESKTOP_VERSION: desktopVersion,
          TEST_FIXTURE: join(temp, 'fixture.json'),
          TEST_CALLS: join(temp, 'calls.jsonl'),
        },
      }
    );
    const calls = (
      await readFile(join(temp, 'calls.jsonl'), 'utf8').catch(() => '')
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);
    return {
      result,
      calls,
      notes: await readFile(
        join(temp, 'desktop-release-notes.md'),
        'utf8'
      ).catch(() => ''),
    };
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
  const create = calls.find(
    (args) => args[0] === 'release' && args[1] === 'create'
  );
  assert.equal(create[2], tag);
  assert.doesNotMatch(create[2], /-\d+$/);
  assert.ok(create.includes(`Tuturuuu ${version} desktop beta`));
  assert.ok(create.includes('--draft'));
  assert.ok(!create.includes('--clobber'));
});

test('publication refuses a version that is missing or no longer next', async () => {
  for (const options of [
    { desktopVersion: '' },
    { desktopVersion: pubspecVersion },
    { releases: [...history, `${tag}\t${'c'.repeat(40)}\ttrue`] },
  ]) {
    const { result, calls } = await runPublication(
      {},
      undefined,
      'linux',
      'deb-package-verified',
      options
    );
    assert.notEqual(result.status, 0, JSON.stringify(options));
    assert.ok(!calls.some((args) => args[0] === 'release'));
  }
});

test('release notes keep the run ID and source in build details, not the tag', async () => {
  const { result, notes } = await runPublication();
  assert.equal(result.status, 0, result.stderr);
  for (const heading of [
    'Highlights',
    'Fixes',
    'Known issues',
    'Downloads',
    'Verify your download',
  ])
    assert.match(notes, new RegExp(`^## ${heading}$`, 'm'));
  assert.match(notes, /\| Linux \| \[Tuturuuu-linux-x64\.deb\]/);
  assert.match(notes, /\| 1 MB \|/);
  assert.match(notes, /actions\/runs\/123\)/);
  assert.match(notes, new RegExp(`commit/${source}`));
  assert.match(notes, /can't see it in the in-app updater/);
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
    assert.ok(
      !calls.some(
        (args) =>
          (args[0] === 'api' && args[1] !== '--paginate') || args[1] === 'edit'
      )
    );
  }
});

test('actual Windows release notes disclose unsigned trust and checksum without claiming Authenticode', async () => {
  const { result, notes } = await runPublication(
    {},
    undefined,
    'windows',
    'unsigned-windows'
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(notes, /Windows packages are UNSIGNED/);
  assert.match(notes, /\| Windows \| \[Tuturuuu-windows-x64-setup\.exe\]/);
  assert.match(notes, /SmartScreen/);
  assert.match(notes, /More info, then Run anyway/);
  assert.match(notes, /in-app updater requires publisher signatures/);
  assert.match(notes, new RegExp(sha256));
  assert.doesNotMatch(
    notes,
    /Windows packages have timestamped Authenticode signatures/
  );
  const signed = await runPublication(
    {},
    undefined,
    'windows',
    'authenticode-timestamped'
  );
  assert.equal(signed.result.status, 0, signed.result.stderr);
  assert.match(
    signed.notes,
    /Windows packages have timestamped Authenticode signatures/
  );
  assert.doesNotMatch(signed.notes, /Windows packages are UNSIGNED/);
});

test('queued run skips a leftover draft; a racing stale build is refused before creation', async () => {
  const reserved = [...history, `${tag}\t${'c'.repeat(40)}\ttrue`];
  const next = nextDesktopVersion(
    pubspec,
    reserved.map((line) => line.split('\t')[0])
  );
  assert.notEqual(next, version);
  const queued = await runPublication(
    {},
    undefined,
    'linux',
    'deb-package-verified',
    { desktopVersion: next, releases: reserved }
  );
  assert.equal(queued.result.status, 0, queued.result.stderr);
  assert.equal(
    queued.calls.find((args) => args[1] === 'create')[2],
    `desktop-v${next}`
  );
  for (const state of ['true', 'false']) {
    const stale = await runPublication(
      {},
      undefined,
      'linux',
      'deb-package-verified',
      { releases: [...history, `${tag}\t${source}\t${state}`] }
    );
    assert.notEqual(stale.result.status, 0);
    assert.ok(!stale.calls.some((args) => args[0] === 'release'));
  }
});
