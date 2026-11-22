import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildManifest,
  compareCounts,
  parseCountsCsv,
} from './backup-manifest.mjs';

const header = 'schema,table,rows';
const cli = new URL('./backup-manifest.mjs', import.meta.url).pathname;

test('parseCountsCsv reads schema-qualified counts, including quoted names', () => {
  const counts = parseCountsCsv(
    `${header}\npublic,workspaces,12\nprivate,mail_messages,0\npublic,"meet-together, plans",4\n`
  );
  assert.equal(counts.get('public.workspaces'), 12);
  assert.equal(counts.get('private.mail_messages'), 0);
  assert.equal(counts.get('public.meet-together, plans'), 4);
});

test('parseCountsCsv rejects malformed, duplicate and non-integer rows', () => {
  assert.throws(() => parseCountsCsv(''), /empty/);
  assert.throws(() => parseCountsCsv('table,rows\nx,1'), /header/);
  assert.throws(() => parseCountsCsv(`${header}\npublic,a,1,2`), /Malformed/);
  assert.throws(() => parseCountsCsv(`${header}\npublic,a,-1`), /non-negative/);
  assert.throws(
    () => parseCountsCsv(`${header}\npublic,a,1e9`),
    /non-negative/
  );
  assert.throws(
    () => parseCountsCsv(`${header}\npublic,a,1\npublic,a,1`),
    /Duplicate/
  );
});

test('parse errors never echo table names or counts', () => {
  for (const run of [
    () => parseCountsCsv(`${header}\npublic,secret_table,1,2`),
    () => parseCountsCsv(`${header}\npublic,secret_table,-7`),
    () =>
      parseCountsCsv(`${header}\npublic,secret_table,1\npublic,secret_table,1`),
  ]) {
    assert.throws(run, (error) => !/secret|-7/.test(error.message));
  }
});

test('compareCounts passes only when every source table matches', () => {
  const source = parseCountsCsv(`${header}\npublic,a,3\npublic,b,0`);
  const same = parseCountsCsv(
    `${header}\npublic,a,3\npublic,b,0\nextensions,c,9`
  );
  const report = compareCounts(source, same);
  assert.equal(report.ok, true);
  assert.deepEqual(report.extra, ['extensions.c']);
  assert.equal(report.rows, 3);
});

test('compareCounts fails on a missing table or a count difference', () => {
  const source = parseCountsCsv(`${header}\npublic,a,3\npublic,b,1`);
  const restored = parseCountsCsv(`${header}\npublic,a,2`);
  const report = compareCounts(source, restored);
  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, ['public.b']);
  assert.deepEqual(report.mismatched, [
    { table: 'public.a', source: 3, restored: 2 },
  ]);
});

test('compare-counts writes a failed report when input cannot be parsed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'backup-cli-'));
  try {
    writeFileSync(join(dir, 'source.csv'), `${header}\npublic,a,not-a-number`);
    writeFileSync(join(dir, 'restored.csv'), `${header}\npublic,a,1`);
    const report = join(dir, 'report.json');
    let status = 0;
    let stdout = '';
    try {
      stdout = execFileSync('node', [
        cli,
        'compare-counts',
        join(dir, 'source.csv'),
        join(dir, 'restored.csv'),
        report,
      ]).toString();
    } catch (error) {
      status = error.status;
      stdout = error.stdout.toString();
    }
    assert.equal(status, 1);
    assert.match(stdout, /^Row-count parity: FAILED/);
    assert.doesNotMatch(stdout, /not-a-number|public/);
    assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), {
      ok: false,
      error: 'parse',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildManifest hashes each file and records parity without row data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'backup-manifest-'));
  try {
    const file = join(dir, 'db.dump.age');
    writeFileSync(file, 'ciphertext');
    const manifest = await buildManifest({
      target: 'staging',
      projectRef: 'ref',
      gitSha: 'abc',
      runId: '1-1',
      snapshotTakenAt: '2026-11-23T00:00:00Z',
      parity: { ok: true, tables: 2, rows: 3, missing: [], mismatched: [] },
      storage: { ok: true, objects: 4, missing: ['secret/key'] },
      files: [file],
    });
    const expected = createHash('sha256').update('ciphertext').digest('hex');
    assert.deepEqual(manifest.files, [
      { name: 'db.dump.age', sha256: expected },
    ]);
    assert.deepEqual(manifest.parity, { ok: true, tables: 2, rows: 3 });
    assert.deepEqual(manifest.storage, { ok: true, objects: 4 });
    assert.equal(manifest.restore, null);

    const catalog = await buildManifest({
      target: 'staging',
      mode: 'catalog',
      parity: null,
      files: [file],
    });
    assert.equal(catalog.parity, null);
    assert.equal(catalog.mode, 'catalog');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
