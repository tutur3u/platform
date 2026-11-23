#!/usr/bin/env node
// Row-count parity, storage parity and manifest helpers for the gated
// Supabase export job. The job captures per-table counts inside the same
// snapshot as pg_dump, restores the dump into a disposable Postgres, and
// compares the two count files. Workflow logs are public, so messages and
// errors name a line number at most, never a table, key or count.

import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareStorageKeys,
  exportDiskBytes,
  findUnsafeBuckets,
  listDownloads,
  STORAGE_CATEGORIES,
  parseExcludedKeys,
  parseExpectedKeys,
  parseTable,
} from './storage-parity.mjs';

export function parseCountsCsv(text) {
  const counts = new Map();
  for (const [index, [schema, table, rows]] of parseTable(text, [
    'schema',
    'table',
    'rows',
  ]).entries()) {
    const row = index + 2;
    if (schema === '' || table === '') {
      throw new Error(`Empty identifier in counts row ${row}.`);
    }
    if (!/^\d+$/.test(rows)) {
      throw new Error(`Row count is not a non-negative integer in row ${row}.`);
    }
    const key = `${schema}.${table}`;
    if (counts.has(key)) throw new Error(`Duplicate counts row ${row}.`);
    counts.set(key, Number(rows));
  }
  return counts;
}

// Every source table must exist in the restore with an identical count.
// Extra restored tables are reported but do not fail parity.
export function compareCounts(source, restored) {
  const missing = [];
  const mismatched = [];
  for (const [key, rows] of source) {
    if (!restored.has(key)) missing.push(key);
    else if (restored.get(key) !== rows) {
      mismatched.push({
        table: key,
        source: rows,
        restored: restored.get(key),
      });
    }
  }
  const extra = [...restored.keys()].filter((key) => !source.has(key));
  return {
    ok: missing.length === 0 && mismatched.length === 0,
    tables: source.size,
    rows: [...source.values()].reduce((sum, value) => sum + value, 0),
    missing: missing.sort(),
    mismatched: mismatched.sort((a, b) => a.table.localeCompare(b.table)),
    extra: extra.sort(),
  };
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export async function buildManifest({
  target,
  projectRef,
  gitSha,
  runId,
  snapshotTakenAt,
  mode = 'export',
  parity,
  storage,
  restore,
  files,
}) {
  const entries = [];
  for (const file of files) {
    entries.push({ name: basename(file), sha256: await sha256File(file) });
  }
  return {
    version: 1,
    target,
    projectRef,
    gitSha,
    runId,
    snapshotTakenAt,
    mode,
    parity: parity
      ? { ok: parity.ok, tables: parity.tables ?? 0, rows: parity.rows ?? 0 }
      : null,
    storage: storage ? storageSummary(storage) : null,
    restore: restore ? { errorsIgnored: restore.errorsIgnored } : null,
    files: entries.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const BUCKET_ID = /^[a-z0-9][a-z0-9._-]*$/;
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

function categoryCounts(source) {
  const out = {};
  for (const category of STORAGE_CATEGORIES) {
    if (isCount(source?.[category])) out[category] = source[category];
  }
  return out;
}

// Numbers only: ok, objects, whether the live listing ran, and category
// counts overall and per bucket id. Key lists never enter the manifest.
function storageSummary(storage) {
  const summary = { ok: storage.ok, objects: storage.objects ?? 0 };
  if (typeof storage.liveChecked === 'boolean') {
    summary.liveChecked = storage.liveChecked;
  }
  if (storage.counts) summary.counts = categoryCounts(storage.counts);
  if (storage.byBucket && typeof storage.byBucket === 'object') {
    summary.byBucket = Object.fromEntries(
      Object.entries(storage.byBucket)
        .filter(([id]) => BUCKET_ID.test(id))
        .map(([id, counts]) => [id, categoryCounts(counts)])
    );
  }
  return summary;
}

function writeReport(path, report) {
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

// A parse failure still writes a failed report, so the job uploads its
// archives and the manifest records that parity failed.
function guarded(reportPath, label, run) {
  try {
    const report = run();
    writeReport(reportPath, report);
    console.log(`${label}: ${report.ok ? 'ok' : 'FAILED'}`);
    return report.ok ? 0 : 1;
  } catch {
    writeReport(reportPath, { ok: false, error: 'parse' });
    console.log(`${label}: FAILED (input could not be parsed)`);
    return 1;
  }
}

function sumColumn(text, header, column) {
  const index = header.indexOf(column);
  let total = 0;
  for (const fields of parseTable(text, header)) {
    if (/^\d+$/.test(fields[index])) total += Number(fields[index]);
  }
  return total;
}

const SIZES_HEADER = [
  'schema',
  'table',
  'estimated_rows',
  'total_bytes',
  'index_bytes',
  'indexes',
  'inserts',
  'updates',
  'deletes',
  'stats_reset',
];

async function main(argv) {
  const [command, ...args] = argv;
  if (command === 'compare-counts') {
    const [sourcePath, restoredPath, reportPath] = args;
    return guarded(reportPath, 'Row-count parity', () =>
      compareCounts(
        parseCountsCsv(readFileSync(sourcePath, 'utf8')),
        parseCountsCsv(readFileSync(restoredPath, 'utf8'))
      )
    );
  }
  if (command === 'compare-storage') {
    // The two live-listing paths are optional: without them every
    // difference from the snapshot fails.
    const [
      expectedPath,
      excludedPath,
      root,
      bucketsPath,
      reportPath,
      liveKeysPath,
      liveExcludedPath,
    ] = args;
    return guarded(reportPath, 'Storage parity', () => {
      const buckets = parseTable(readFileSync(bucketsPath, 'utf8'), ['id']).map(
        ([id]) => id
      );
      const live =
        liveKeysPath && liveExcludedPath
          ? {
              keys: parseExpectedKeys(readFileSync(liveKeysPath, 'utf8')),
              excluded: parseExcludedKeys(
                readFileSync(liveExcludedPath, 'utf8')
              ),
            }
          : undefined;
      return compareStorageKeys(
        parseExpectedKeys(readFileSync(expectedPath, 'utf8')),
        parseExcludedKeys(readFileSync(excludedPath, 'utf8')),
        listDownloads(root, buckets),
        live
      );
    });
  }
  if (command === 'unsafe-buckets') {
    // Writes bucket ids (one per line) to a file, never to stdout.
    const [expectedPath, excludedPath, outPath] = args;
    try {
      const buckets = findUnsafeBuckets(
        parseExpectedKeys(readFileSync(expectedPath, 'utf8')),
        parseExcludedKeys(readFileSync(excludedPath, 'utf8'))
      );
      writeFileSync(outPath, [...buckets].map((b) => `${b}\n`).join(''));
      return 0;
    } catch {
      return 1;
    }
  }
  if (command === 'disk-needed') {
    const [sizesPath, expectedPath] = args;
    const relationBytes = sumColumn(
      readFileSync(sizesPath, 'utf8'),
      SIZES_HEADER,
      'total_bytes'
    );
    let storageBytes = 0;
    for (const size of parseExpectedKeys(
      readFileSync(expectedPath, 'utf8')
    ).values()) {
      storageBytes += size;
    }
    process.stdout.write(`${exportDiskBytes(relationBytes, storageBytes)}\n`);
    return 0;
  }
  if (command === 'manifest') {
    const [optionsPath, outputPath, ...files] = args;
    const options = JSON.parse(readFileSync(optionsPath, 'utf8'));
    writeReport(outputPath, await buildManifest({ ...options, files }));
    return 0;
  }
  console.error(
    'Usage: backup-manifest.mjs compare-counts|compare-storage|disk-needed|manifest ...'
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    () => {
      console.error('backup-manifest failed (input could not be parsed).');
      process.exit(1);
    }
  );
}
