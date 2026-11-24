import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  COLLISION_SUFFIX,
  collisionCopyKeys,
  compareStorageKeys,
  findCollisionKeys,
  findUnsafeBuckets,
  isUnsafeKey,
  listDownloads,
  MAX_COLLISION_KEYS,
  parseExcludedKeys,
  parseExpectedKeys,
  parseKeyRecords,
} from './storage-parity.mjs';

const MANIFEST = join(
  dirname(fileURLToPath(import.meta.url)),
  'backup-manifest.mjs'
);
const noExcluded = () => parseExcludedKeys('bucket,name\n');
const sized = (rows) =>
  parseExpectedKeys(`bucket,name,size\n${rows.join('\n')}\n`);

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'storage-collisions-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const downloads = (root, buckets, expected, excluded = noExcluded()) =>
  listDownloads(root, buckets, collisionCopyKeys(expected, excluded));

test('a key next to its own children is a collision key', () => {
  const records = findCollisionKeys(
    sized(['workspaces,ws/a,3', 'workspaces,ws/a/child.png,5']),
    noExcluded()
  );
  assert.deepEqual(records, [
    {
      bucket: 'workspaces',
      name: 'ws/a',
      pattern: 'ws/a',
      copyTo: `ws/a${COLLISION_SUFFIX}`,
    },
  ]);
});

test('every level of a nested prefix chain is a collision key, siblings and folder keys are not', () => {
  const records = findCollisionKeys(
    sized([
      'b,a,1',
      'b,a/b,2',
      'b,a/b/c,3',
      'b,ab,4',
      'b,other/file,5',
      'b,p,6',
      'b,pq/r,7',
    ]),
    parseExcludedKeys('bucket,name\nb,folder/\nb,folder/x\n')
  );
  assert.deepEqual(
    records.map((record) => record.name),
    ['a', 'a/b']
  );
});

test('a folder key that holds children is not a collision, a file key beside a folder key is', () => {
  const records = findCollisionKeys(
    sized(['b,dir/child,1', 'b,file,2', 'b,file/,0']),
    parseExcludedKeys('bucket,name\nb,dir/\n')
  );
  assert.deepEqual(
    records.map((record) => record.name),
    ['file']
  );
});

test('collisions are found per bucket', () => {
  const records = findCollisionKeys(
    sized(['one,a,1', 'two,a/b,2']),
    noExcluded()
  );
  assert.deepEqual(records, []);
});

test('an unsized colliding key is excluded from the sync but not copied', () => {
  const [record] = findCollisionKeys(
    sized(['b,a/child,1']),
    parseExcludedKeys('bucket,name\nb,a\n')
  );
  assert.equal(record.name, 'a');
  assert.equal(record.copyTo, '');
});

test('glob characters in a colliding key are escaped for the sync exclude', () => {
  const [record] = findCollisionKeys(
    sized(['b,x/[1]*?,1', 'b,x/[1]*?/c,2']),
    noExcluded()
  );
  assert.equal(record.pattern, 'x/[[]1][*][?]');
});

test('a key with a path segment ending in the reserved suffix is unsafe, and its bucket is not synced', () => {
  assert.equal(isUnsafeKey(`a/b${COLLISION_SUFFIX}`), true);
  assert.equal(isUnsafeKey(`a${COLLISION_SUFFIX}/b`), true);
  assert.equal(isUnsafeKey(`a/b${COLLISION_SUFFIX}/`), true);
  assert.equal(isUnsafeKey('a/b.__tuturuuu_object'), false);
  const expected = sized([
    `b,ok/file,1`,
    `b,k${COLLISION_SUFFIX},1`,
    'c,fine,1',
  ]);
  assert.deepEqual([...findUnsafeBuckets(expected, noExcluded())], ['b']);
  const report = compareStorageKeys(expected, noExcluded(), new Map());
  assert.equal(report.ok, false);
  assert.deepEqual(report.unsafe, [`b/k${COLLISION_SUFFIX}`]);
});

test('parity maps the reserved file name back to its key and stays exact', () => {
  const root = tree({
    'workspaces/ws/a/child.png': 'hello',
    [`workspaces/ws/a${COLLISION_SUFFIX}`]: 'abc',
    'workspaces/ws/a/b/c.txt': 'xy',
    [`workspaces/ws/a/b${COLLISION_SUFFIX}`]: 'z',
  });
  try {
    const expected = sized([
      'workspaces,ws/a,3',
      'workspaces,ws/a/child.png,5',
      'workspaces,ws/a/b,1',
      'workspaces,ws/a/b/c.txt,2',
    ]);
    const report = compareStorageKeys(
      expected,
      noExcluded(),
      downloads(root, ['workspaces'], expected)
    );
    assert.equal(report.ok, true);
    assert.equal(report.counts.missing, 0);
    assert.equal(report.counts.unexpected, 0);
    assert.equal(report.objects, 4);
    assert.equal(report.bytes, 11);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a colliding key that was not copied still fails parity as missing, and a wrong size fails', () => {
  const root = tree({ 'workspaces/ws/a/child.png': 'hello' });
  try {
    const expected = sized([
      'workspaces,ws/a,3',
      'workspaces,ws/a/child.png,5',
    ]);
    const missing = compareStorageKeys(
      expected,
      noExcluded(),
      downloads(root, ['workspaces'], expected)
    );
    assert.equal(missing.ok, false);
    assert.deepEqual(missing.missing, ['workspaces/ws/a']);

    writeFileSync(join(root, `workspaces/ws/a${COLLISION_SUFFIX}`), 'abcdef');
    const wrongSize = compareStorageKeys(
      expected,
      noExcluded(),
      downloads(root, ['workspaces'], expected)
    );
    assert.equal(wrongSize.ok, false);
    assert.deepEqual(wrongSize.sizeMismatch, ['workspaces/ws/a']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runCollisionKeys(expectedCsv, excludedCsv) {
  const dir = mkdtempSync(join(tmpdir(), 'collision-cli-'));
  try {
    writeFileSync(join(dir, 'keys.csv'), expectedCsv);
    writeFileSync(join(dir, 'excluded.csv'), excludedCsv);
    const result = spawnSync(
      process.execPath,
      [
        MANIFEST,
        'collision-keys',
        join(dir, 'keys.csv'),
        join(dir, 'excluded.csv'),
        join(dir, 'out.bin'),
      ],
      { encoding: 'utf8' }
    );
    let out = null;
    try {
      out = readFileSync(join(dir, 'out.bin'), 'utf8');
    } catch {}
    return { status: result.status, stdout: result.stdout, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('collision-keys writes four NUL-terminated fields per key and prints nothing', () => {
  const { status, stdout, out } = runCollisionKeys(
    'bucket,name,size\nworkspaces,ws/a,3\nworkspaces,ws/a/c,5\n',
    'bucket,name\n'
  );
  assert.equal(status, 0);
  assert.equal(stdout, '');
  assert.equal(
    out,
    `workspaces\u0000ws/a\u0000ws/a\u0000ws/a${COLLISION_SUFFIX}\u0000`
  );
});

test('collision-keys writes an empty file when nothing collides', () => {
  const { status, out } = runCollisionKeys(
    'bucket,name,size\nworkspaces,a,3\nworkspaces,b,5\n',
    'bucket,name\n'
  );
  assert.equal(status, 0);
  assert.equal(out, '');
});

function collisionRows(count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) rows.push(`b,k${i},1`, `b,k${i}/c,1`);
  return `bucket,name,size\n${rows.join('\n')}\n`;
}

test('collision-keys accepts exactly the cap', () => {
  const { status, out } = runCollisionKeys(
    collisionRows(MAX_COLLISION_KEYS),
    'bucket,name\n'
  );
  assert.equal(status, 0);
  assert.equal(out.split('\u0000').length - 1, MAX_COLLISION_KEYS * 4);
});

test('collision-keys exits 3 and writes nothing above the cap', () => {
  const { status, out } = runCollisionKeys(
    collisionRows(MAX_COLLISION_KEYS + 1),
    'bucket,name\n'
  );
  assert.equal(status, 3);
  assert.equal(out, null);
});

test('collision-keys keeps an empty copy name for an unsized key and the raw name of a key that starts with a dash', () => {
  const { status, out } = runCollisionKeys(
    'bucket,name,size\nb,-tmp,1\nb,-tmp/f,1\nb,u/c,1\n',
    'bucket,name\nb,u\n'
  );
  assert.equal(status, 0);
  assert.equal(
    out,
    `b\u0000-tmp\u0000-tmp\u0000-tmp${COLLISION_SUFFIX}\u0000b\u0000u\u0000u\u0000\u0000`
  );
});

test('collision-suffix prints the reserved suffix', () => {
  const result = spawnSync(process.execPath, [MANIFEST, 'collision-suffix'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, COLLISION_SUFFIX);
});

test('a colliding key whose copy name exceeds the file name limit is unsafe, a shorter one is not', () => {
  const room = 255 - COLLISION_SUFFIX.length;
  const fits = `a/${'x'.repeat(room)}`;
  const tooLong = `a/${'y'.repeat(room + 1)}`;
  const expected = sized([
    `b,${fits},1`,
    `b,${fits}/c,1`,
    `c,${tooLong},1`,
    `c,${tooLong}/c,1`,
    `d,${tooLong},1`,
  ]);
  assert.deepEqual([...findUnsafeBuckets(expected, noExcluded())], ['c']);
  const report = compareStorageKeys(expected, noExcluded(), new Map());
  assert.deepEqual(report.unsafe, [`c/${tooLong}`]);
  assert.equal(report.ok, false);
});

test('a plain file keeps its key when a reserved file name maps to the same key, and a bare suffix file stays literal', () => {
  const root = tree({
    'b/x': 'abc',
    [`b/x${COLLISION_SUFFIX}`]: 'stray!',
    [`b/${COLLISION_SUFFIX}`]: 'bare',
  });
  try {
    const expected = sized(['b,x,3', 'b,x/c,1']);
    const downloaded = downloads(root, ['b'], expected);
    assert.equal(downloaded.get('b\u0000x'), 3);
    assert.equal(downloaded.get(`b\u0000x${COLLISION_SUFFIX}`), 6);
    assert.equal(downloaded.get(`b\u0000${COLLISION_SUFFIX}`), 4);
    const report = compareStorageKeys(expected, noExcluded(), downloaded);
    assert.equal(report.ok, false);
    assert.deepEqual(report.unexpected, [
      `b/${COLLISION_SUFFIX}`,
      `b/x${COLLISION_SUFFIX}`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a reserved file name is mapped only for a sized colliding key, never for an excluded or unrelated key', () => {
  const root = tree({
    [`b/pending${COLLISION_SUFFIX}`]: 'stray',
    [`b/a/stray${COLLISION_SUFFIX}`]: 'stray2',
    [`b/dir/..${COLLISION_SUFFIX}`]: 'dots',
    'b/real': 'ok',
  });
  try {
    const expected = sized(['b,real,2']);
    const excluded = parseExcludedKeys('bucket,name\nb,pending\n');
    const downloaded = downloads(root, ['b'], expected, excluded);
    assert.equal(downloaded.has('b\u0000pending'), false);
    assert.equal(downloaded.has('b\u0000a/stray'), false);
    const report = compareStorageKeys(expected, excluded, downloaded);
    assert.equal(report.ok, false);
    assert.deepEqual(report.unexpected, [
      `b/a/stray${COLLISION_SUFFIX}`,
      `b/dir/..${COLLISION_SUFFIX}`,
      `b/pending${COLLISION_SUFFIX}`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a bare suffix file inside a directory stays literal and is not hidden by an excluded folder key', () => {
  const root = tree({
    [`b/dir/${COLLISION_SUFFIX}`]: 'bare',
    'b/dir/real': 'ok',
  });
  try {
    const downloaded = listDownloads(root, ['b']);
    assert.equal(downloaded.has('b\u0000dir/'), false);
    assert.equal(downloaded.get(`b\u0000dir/${COLLISION_SUFFIX}`), 4);
    const report = compareStorageKeys(
      sized(['b,dir/real,2']),
      parseExcludedKeys('bucket,name\nb,dir/\n'),
      downloaded
    );
    assert.equal(report.ok, false);
    assert.deepEqual(report.unexpected, [`b/dir/${COLLISION_SUFFIX}`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('live listing explains colliding keys like any other key', () => {
  const expected = sized(['b,a,3', 'b,a/c,5', 'b,gone,1', 'b,gone/c,1']);
  const root = tree({
    'b/a/c': 'hello',
    'b/gone/c': 'x',
  });
  try {
    const live = {
      keys: sized(['b,a,3', 'b,a/c,5', 'b,gone/c,1']),
      excluded: noExcluded(),
    };
    const report = compareStorageKeys(
      expected,
      noExcluded(),
      downloads(root, ['b'], expected),
      live
    );
    assert.deepEqual(report.deletedSinceSnapshot, ['b/gone']);
    assert.deepEqual(report.missing, ['b/a']);
    const probed = compareStorageKeys(
      expected,
      noExcluded(),
      downloads(root, ['b'], expected),
      live,
      parseKeyRecords('b\u0000a\u0000')
    );
    assert.deepEqual(probed.sourceMissing, ['b/a']);
    assert.deepEqual(probed.missing, []);
    assert.equal(probed.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collision-keys exits 1 on unparseable input without echoing it', () => {
  const { status, stdout } = runCollisionKeys(
    'nope\nsecret-key',
    'bucket,name\n'
  );
  assert.equal(status, 1);
  assert.doesNotMatch(stdout, /secret/);
});
