import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTopUp, topUpRelease } from './release-topup.mjs';

const source = 'a'.repeat(40);
const tag = 'desktop-v0.27.27-1000000';
const files = [
  { name: 'Tuturuuu-linux-x64.deb', sha256: '1'.repeat(64) },
  { name: 'Tuturuuu-windows-x64-setup.exe', sha256: '2'.repeat(64) },
];
const published = {
  id: 7,
  tag_name: tag,
  target_commitish: source,
  draft: false,
  prerelease: true,
  assets: [
    {
      name: files[0].name,
      state: 'uploaded',
      digest: `sha256:${files[0].sha256}`,
      size: 10,
    },
  ],
};

test('a rerun adds only the platforms the first attempt missed', () => {
  assert.deepEqual(planTopUp(published, { tag, source, files }), [files[1]]);
});

test('published assets are never replaced or reused across commits', () => {
  // A rebuilt (re-timestamped) package keeps the published bytes; only the
  // missing platform is added.
  const rebuilt = [{ ...files[0], sha256: '9'.repeat(64) }, files[1]];
  assert.deepEqual(planTopUp(published, { tag, source, files: rebuilt }), [
    files[1],
  ]);
  for (const change of [
    { draft: true },
    { target_commitish: 'b'.repeat(40) },
    { tag_name: 'desktop-v0.27.27-1000001' },
  ])
    assert.throws(
      () => planTopUp({ ...published, ...change }, { tag, source, files }),
      /not this commit's published beta/
    );
});

test('top-up uploads without clobber and verifies the final asset set', () => {
  const calls = [];
  let release = published;
  const execute = (_command, args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view')
      return JSON.stringify({ databaseId: 7 });
    if (args[0] === 'api') return JSON.stringify(release);
    if (args[1] === 'upload')
      release = {
        ...release,
        assets: [
          ...release.assets,
          {
            name: files[1].name,
            state: 'uploaded',
            digest: `sha256:${files[1].sha256}`,
            size: 20,
          },
        ],
      };
    return '';
  };
  assert.deepEqual(
    topUpRelease(
      {
        tag,
        source,
        files,
        directory: '/tmp/d',
        writeNotes: (names) => `/tmp/n-${names.length}`,
      },
      execute
    ),
    [files[1].name]
  );
  const upload = calls.find((args) => args[1] === 'upload');
  assert.ok(!upload.includes('--clobber'));
  assert.ok(upload.includes(`/tmp/d/${files[1].name}`));
});

test('top-up refuses a rerun that lacks an already published package', () => {
  assert.throws(
    () => planTopUp(published, { tag, source, files: [files[1]] }),
    /missing verified packages already on/
  );
});

test('half-uploaded starter assets are cleared before and after an upload', () => {
  const starter = { id: 31, name: files[1].name, state: 'starter' };
  assert.deepEqual(
    planTopUp(
      { ...published, assets: [...published.assets, starter] },
      { tag, source, files }
    ),
    [files[1]]
  );
  const calls = [];
  let release = { ...published, assets: [...published.assets, starter] };
  const execute = (_command, args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view')
      return JSON.stringify({ databaseId: 7 });
    if (args[0] === 'api' && args.includes('DELETE')) {
      release = {
        ...release,
        assets: release.assets.filter((asset) => asset.id !== 31),
      };
      return '';
    }
    if (args[0] === 'api') return JSON.stringify(release);
    if (args[1] === 'upload') {
      release = {
        ...release,
        assets: [...release.assets, { ...starter, id: 32 }],
      };
      throw new Error('502');
    }
    return '';
  };
  assert.throws(
    () =>
      topUpRelease(
        {
          tag,
          source,
          files,
          directory: '/d',
          writeNotes: (names) => `/n-${names.length}`,
        },
        execute
      ),
    /502/
  );
  const deletes = calls.filter((args) => args.includes('DELETE'));
  assert.deepEqual(
    deletes.map((args) => args.at(-1)),
    [
      'repos/tutur3u/platform/releases/assets/31',
      'repos/tutur3u/platform/releases/assets/32',
    ]
  );
});

test('notes go public before the package and match what GitHub accepted', () => {
  const calls = [];
  let release = published;
  const execute = (_command, args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view')
      return JSON.stringify({ databaseId: 7 });
    if (args[0] === 'api') return JSON.stringify(release);
    if (args[1] === 'upload') throw new Error('502');
    return '';
  };
  const written = [];
  assert.throws(
    () =>
      topUpRelease(
        {
          tag,
          source,
          files,
          directory: '/d',
          writeNotes: (names) => {
            written.push(names);
            return `/n-${written.length}`;
          },
        },
        execute
      ),
    /502/
  );
  const order = calls.map((args) => args.slice(0, 2).join(' '));
  assert.ok(order.indexOf('release edit') < order.indexOf('release upload'));
  // Before: every package. After the failure: only what GitHub accepted.
  assert.deepEqual(written, [files.map((file) => file.name), [files[0].name]]);
});

test('notes describe the published bytes of kept packages', () => {
  const rebuilt = [{ ...files[0], sha256: '9'.repeat(64) }, files[1]];
  let release = published;
  const execute = (_command, args) => {
    if (args[0] === 'release' && args[1] === 'view')
      return JSON.stringify({ databaseId: 7 });
    if (args[0] === 'api') return JSON.stringify(release);
    if (args[1] === 'upload')
      release = {
        ...release,
        assets: [
          ...release.assets,
          {
            name: files[1].name,
            state: 'uploaded',
            digest: `sha256:${files[1].sha256}`,
            size: 20,
          },
        ],
      };
    return '';
  };
  const seen = [];
  topUpRelease(
    {
      tag,
      source,
      files: rebuilt,
      directory: '/d',
      writeNotes: (names, facts) => {
        seen.push({ names, facts });
        return '/n';
      },
    },
    execute
  );
  assert.deepEqual(seen[0].facts[files[0].name], {
    sha256: files[0].sha256,
    size: 10,
  });
});

test('a kept package with different rebuilt bytes is never described as signed', async () => {
  const { renderDesktopReleaseNotes } = await import('./release-notes.mjs');
  const notes = renderDesktopReleaseNotes({
    version: '0.27.27',
    build: '1000000',
    source,
    run: '123',
    files: [
      {
        name: 'Tuturuuu-windows-x64-setup.exe',
        sha256: '1'.repeat(64),
        size: 10,
        verification: 'published-unverified',
      },
    ],
    changes: null,
    previous: null,
  });
  assert.doesNotMatch(notes, /timestamped Authenticode/);
  assert.match(notes, /not re-verified/);
  assert.doesNotMatch(notes, /All packages have cryptographically signed/);
  assert.match(notes, /provenance was not re-verified/);
});
