// CSV parsing and storage key parity for the gated Supabase export job.
// Inputs come from psql `\copy … (format csv, header)`, so fields may be
// quoted and may contain commas, quotes or newlines. Workflow logs are
// public, so errors name a line number at most, never a key or a value.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let started = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      started = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      started = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      if (started || field !== '') {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = '';
      started = false;
    } else {
      field += char;
      started = true;
    }
  }
  if (quoted) throw new Error('Unterminated quoted field.');
  if (started || field !== '') {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseTable(text, header) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV file is empty.');
  if (rows[0].join(',') !== header.join(',')) {
    throw new Error('Unexpected CSV header.');
  }
  return rows.slice(1).map((fields, index) => {
    if (fields.length !== header.length) {
      throw new Error(`Malformed CSV row ${index + 2}.`);
    }
    return fields;
  });
}

const BUCKET = /^[a-z0-9][a-z0-9._-]*$/;
const COUNT = /^\d+$/;

function keyOf(bucket, name) {
  return `${bucket}\u0000${name}`;
}

const MAX_SEGMENT_BYTES = 255;

// Object storage lets a key K and keys K/child coexist; a file tree cannot
// hold a file and a directory under one name. The object at K is therefore
// copied to `K<COLLISION_SUFFIX>`, and the comparison maps that file back to
// K. No real key may use a path segment ending in the suffix, or the mapping
// would be ambiguous; such a bucket is treated as unsafe and not synced.
export const COLLISION_SUFFIX = '.__tuturuuu_object__';
export const MAX_COLLISION_KEYS = 500;

// A key that cannot map to a path inside its bucket directory: a leading
// '/', an empty, '.' or '..' segment, a segment longer than a file name, or
// a segment ending in the reserved collision suffix.
// One trailing '/' marks a folder key, for which sync writes no file.
export function isUnsafeKey(name) {
  if (name === '' || name.startsWith('/')) return true;
  const path = name.endsWith('/') ? name.slice(0, -1) : name;
  if (path === '') return true;
  return path
    .split('/')
    .some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith(COLLISION_SUFFIX) ||
        Buffer.byteLength(segment) > MAX_SEGMENT_BYTES
    );
}

// Keys that are also the directory prefix of another key in the same
// bucket (K next to K/child, at any depth), taken over sized and excluded
// keys alike. Each record names the bucket, the key, a glob that matches
// exactly that key for `aws s3 sync --exclude`, and, for a sized key, the
// file name to copy it to inside the bucket directory.
export function findCollisionKeys(expected, excluded) {
  const byBucket = new Map();
  for (const key of [...expected.keys(), ...excluded]) {
    const [bucket, name] = key.split('\u0000');
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
    byBucket.get(bucket).add(name);
  }
  const records = [];
  for (const [bucket, names] of byBucket) {
    const prefixes = new Set();
    for (const name of names) {
      for (
        let at = name.indexOf('/');
        at !== -1;
        at = name.indexOf('/', at + 1)
      ) {
        prefixes.add(name.slice(0, at));
      }
    }
    for (const name of [...names].sort()) {
      if (name.endsWith('/') || !prefixes.has(name)) continue;
      records.push({
        bucket,
        name,
        pattern: name.replace(/[*?[]/g, (char) => `[${char}]`),
        copyTo: expected.has(keyOf(bucket, name))
          ? `${name}${COLLISION_SUFFIX}`
          : '',
      });
    }
  }
  return records;
}

// A sized colliding key whose copy name would exceed the file name limit
// cannot be written, so it is unsafe like any other unmappable key.
function unsafeCollisionKeys(expected, excluded) {
  return findCollisionKeys(expected, excluded)
    .filter(
      ({ copyTo }) =>
        copyTo !== '' &&
        Buffer.byteLength(copyTo.slice(copyTo.lastIndexOf('/') + 1)) >
          MAX_SEGMENT_BYTES
    )
    .map(({ bucket, name }) => keyOf(bucket, name));
}

// Buckets holding at least one unsafe key are not synced at all, so no file
// can be written outside the bucket directory; parity then fails for them.
export function findUnsafeBuckets(expected, excluded) {
  const buckets = new Set();
  for (const key of [...expected.keys(), ...excluded]) {
    const [bucket, name] = key.split('\u0000');
    if (isUnsafeKey(name)) buckets.add(bucket);
  }
  for (const key of unsafeCollisionKeys(expected, excluded)) {
    buckets.add(key.split('\u0000')[0]);
  }
  return buckets;
}

// Sized objects from the snapshot: bucket,name,size.
export function parseExpectedKeys(text) {
  const keys = new Map();
  for (const [index, [bucket, name, size]] of parseTable(text, [
    'bucket',
    'name',
    'size',
  ]).entries()) {
    if (!BUCKET.test(bucket) || name === '' || !COUNT.test(size)) {
      throw new Error(`Malformed expected key row ${index + 2}.`);
    }
    keys.set(keyOf(bucket, name), Number(size));
  }
  return keys;
}

// Objects the snapshot could not size (unfinished uploads, folder keys).
export function parseExcludedKeys(text) {
  const keys = new Set();
  for (const [index, [bucket, name]] of parseTable(text, [
    'bucket',
    'name',
  ]).entries()) {
    if (!BUCKET.test(bucket)) {
      throw new Error(`Malformed excluded key row ${index + 2}.`);
    }
    keys.add(keyOf(bucket, name));
  }
  return keys;
}

// NUL-separated `bucket\0name\0` records, as written by `missing-keys`.
export function parseKeyRecords(text) {
  const parts = text.split('\u0000');
  const keys = new Set();
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (!BUCKET.test(parts[i]) || parts[i + 1] === '') {
      throw new Error('Malformed key record.');
    }
    keys.add(keyOf(parts[i], parts[i + 1]));
  }
  return keys;
}

// Every file under <root>/<bucket>/, keyed by its path inside the bucket. A
// file named `K<COLLISION_SUFFIX>` is the object stored at key K, unless a
// plain file already holds K: then it keeps its literal name and fails
// parity as an unexpected key instead of replacing K's size.
export function listDownloads(root, buckets) {
  const files = new Map();
  for (const bucket of buckets) {
    const base = join(root, bucket);
    const reserved = [];
    const stack = [base];
    while (stack.length > 0) {
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(path);
        else if (entry.isFile()) {
          const name = relative(base, path).split(sep).join('/');
          const size = statSync(path).size;
          if (name.endsWith(COLLISION_SUFFIX)) reserved.push([name, size]);
          else files.set(keyOf(bucket, name), size);
        }
      }
    }
    for (const [name, size] of reserved) {
      const stem = name.slice(0, -COLLISION_SUFFIX.length);
      const mapped =
        stem !== '' && !stem.endsWith('/') && !files.has(keyOf(bucket, stem));
      files.set(keyOf(bucket, mapped ? stem : name), size);
    }
  }
  return files;
}

// Every sized key must be downloaded with its exact size. A downloaded file
// that is not a sized key is allowed only if the snapshot excluded it.
//
// The copy runs after the snapshot, so live traffic moves keys in between.
// `live` is storage.objects read again after the copy (outside the
// snapshot). A key that is gone there was deleted after the snapshot; one
// that appears there was created after it; one whose live size matches the
// download changed after it. Those are reported but do not fail parity, since
// the copy holds the bytes current at copy time. Only keys the live listing
// cannot explain fail. Without `live`, every difference fails.
//
// The report keeps key-level detail (it is encrypted). `counts` and
// `byBucket` hold numbers only, for the plaintext manifest.
export const STORAGE_CATEGORIES = [
  'unsafe',
  'missing',
  'sizeMismatch',
  'unexpected',
  'deletedSinceSnapshot',
  'changedSinceSnapshot',
  'createdSinceSnapshot',
  'sourceMissing',
];

// `sourceMissing` holds keys the job probed after the copy and the storage
// backend answered 404 for: the row exists but the source has no bytes, so
// no backup can hold them. They are counted, not hidden, and do not fail
// parity; any other missing key does. It applies only with `live`.
export function compareStorageKeys(
  expected,
  excluded,
  downloaded,
  live,
  sourceMissing = new Set()
) {
  const unsafe = [
    ...new Set([
      ...[...expected.keys(), ...excluded].filter((key) =>
        isUnsafeKey(key.split('\u0000')[1])
      ),
      ...unsafeCollisionKeys(expected, excluded),
    ]),
  ];
  const liveHas = (key) =>
    live !== undefined && (live.keys.has(key) || live.excluded.has(key));
  const missing = [];
  const sizeMismatch = [];
  const unexpected = [];
  const deletedSinceSnapshot = [];
  const changedSinceSnapshot = [];
  const createdSinceSnapshot = [];
  const sourceMissingKeys = [];
  for (const [key, size] of expected) {
    if (!downloaded.has(key)) {
      if (live !== undefined && !liveHas(key)) deletedSinceSnapshot.push(key);
      else if (live !== undefined && sourceMissing.has(key)) {
        sourceMissingKeys.push(key);
      } else missing.push(key);
    } else if (downloaded.get(key) !== size) {
      if (live?.keys.get(key) === downloaded.get(key)) {
        changedSinceSnapshot.push(key);
      } else sizeMismatch.push(key);
    }
  }
  for (const [key, size] of downloaded) {
    if (expected.has(key) || excluded.has(key)) continue;
    if (live?.excluded.has(key) || live?.keys.get(key) === size) {
      createdSinceSnapshot.push(key);
    } else unexpected.push(key);
  }
  const readable = (key) => key.replace('\u0000', '/');
  const lists = {
    unsafe,
    missing,
    sizeMismatch,
    unexpected,
    deletedSinceSnapshot,
    changedSinceSnapshot,
    createdSinceSnapshot,
    sourceMissing: sourceMissingKeys,
  };
  const counts = {};
  // A Map, so a bucket id such as `constructor` is an ordinary key.
  const perBucket = new Map();
  for (const [category, keys] of Object.entries(lists)) {
    counts[category] = keys.length;
    for (const key of keys) {
      const id = key.split('\u0000')[0];
      if (!perBucket.has(id)) perBucket.set(id, {});
      const bucket = perBucket.get(id);
      bucket[category] = (bucket[category] ?? 0) + 1;
    }
  }
  const byBucket = Object.fromEntries(perBucket);
  let bytes = 0;
  for (const size of expected.values()) bytes += size;
  return {
    ok:
      unsafe.length === 0 &&
      missing.length === 0 &&
      sizeMismatch.length === 0 &&
      unexpected.length === 0,
    objects: expected.size,
    bytes,
    liveChecked: live !== undefined,
    counts,
    byBucket,
    ...Object.fromEntries(
      Object.entries(lists).map(([category, keys]) => [
        category,
        keys.map(readable).sort(),
      ])
    ),
  };
}

// Bytes needed on WORK_DIR for an export: the dump and the restored cluster
// are each bounded by the source relation sizes; storage needs the
// downloaded tree plus its encrypted archive.
export function exportDiskBytes(totalRelationBytes, storageBytes) {
  const margin = 2 * 1024 ** 3;
  return 2 * totalRelationBytes + 2 * storageBytes + margin;
}
