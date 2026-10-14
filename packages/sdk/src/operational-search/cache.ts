import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  exclusiveFile,
  privateParent,
  safePath,
} from '../cli/operational-files';
import { digest, fail, parseJson } from '../cli/operational-schema';
import { searchableDocumentSchema } from './lexical';

export const MAX_CACHE_BYTES = 32 * 1024 ** 2;
export const vectorSchema = z.array(z.number().finite()).length(768);
export const cacheSchema = z
  .object({
    version: z.literal(1),
    projectionVersion: z.literal(1),
    sourceDatabaseId: z.uuid(),
    revision: z.number().int().nonnegative(),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    modelFingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    documents: z.array(searchableDocumentSchema).max(10000),
    vectors: z
      .array(
        z
          .object({
            id: z.string(),
            contentHash: z.string(),
            values: vectorSchema,
          })
          .strict()
      )
      .max(10000),
  })
  .strict()
  .superRefine((cache, context) => {
    const ids = new Set(cache.documents.map((document) => document.id));
    if (ids.size !== cache.documents.length)
      context.addIssue({ code: 'custom', message: 'duplicate document id' });
    const vectorIds = new Set(cache.vectors.map((vector) => vector.id));
    const hashes = new Map(
      cache.documents.map((document) => [document.id, document.contentHash])
    );
    if (
      vectorIds.size !== cache.vectors.length ||
      (!cache.modelFingerprint && cache.vectors.length)
    )
      context.addIssue({ code: 'custom', message: 'invalid vector identity' });
    for (const vector of cache.vectors) {
      if (
        hashes.get(vector.id) !== vector.contentHash ||
        !vector.values.some((value) => value !== 0)
      )
        context.addIssue({
          code: 'custom',
          message: 'invalid vector provenance or zero vector',
        });
    }
  });
export type SearchCache = z.infer<typeof cacheSchema>;
const envelopeSchema = z
  .object({ cache: cacheSchema, hash: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();

export function readPrivateFile(
  input: string,
  maxBytes = MAX_CACHE_BYTES
): Buffer {
  const fd = openSync(
    safePath(input),
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > maxBytes)
      fail(
        'UNSAFE_CACHE',
        'file must be private, regular and within the byte bound'
      );
    const data = readFileSync(fd);
    if (data.length > maxBytes)
      fail('SEARCH_CAPACITY', 'file exceeds byte bound');
    return data;
  } finally {
    closeSync(fd);
  }
}

export function writeCache(input: string, value: SearchCache) {
  const cache = cacheSchema.parse(value);
  writePrivateJson(input, { cache, hash: digest(cache) }, () =>
    readCache(input)
  );
}

export function assertDerivedPath(database: string, input: string) {
  const source = safePath(database);
  const target = safePath(input);
  if (
    source === target ||
    target.startsWith(`${source}.`) ||
    target.startsWith(`${source}-`)
  )
    fail(
      'AUTHORITATIVE_PATH',
      'derived cache must not replace a source store or its sidecars'
    );
  try {
    const before = statSync(source);
    const after = statSync(target);
    if (before.ino === after.ino && before.dev === after.dev)
      fail(
        'AUTHORITATIVE_PATH',
        'derived cache must not alias the source store'
      );
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
}

export function writePrivateJson(
  input: string,
  value: unknown,
  validatePrevious?: () => unknown
) {
  const path = safePath(input);
  privateParent(path);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > MAX_CACHE_BYTES)
    fail('SEARCH_CAPACITY', 'derived index exceeds 32 MiB');
  const release = acquirePrivateLock(`${path}.lock.sqlite`);
  let temporary: string | undefined;
  try {
    const entries = readdirSync(dirname(path));
    if (entries.length > 1000)
      fail(
        'SEARCH_CAPACITY',
        'use a dedicated bounded private cache directory'
      );
    let pendingBytes = 0;
    for (const name of entries) {
      if (name.startsWith(`${basename(path)}.pending-`))
        pendingBytes += statSync(safePath(join(dirname(path), name))).size;
    }
    if (pendingBytes + Buffer.byteLength(encoded) > MAX_CACHE_BYTES * 2)
      fail(
        'SEARCH_CAPACITY',
        'retained interrupted writes exceed the 64 MiB scratch budget'
      );
    try {
      readPrivateFile(path);
      if (!validatePrevious)
        fail(
          'CACHE_OWNERSHIP',
          'refusing to replace an existing file without validated cache ownership'
        );
      validatePrevious();
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        throw error;
    }
    temporary = exclusiveFile(`${path}.pending-${randomUUID()}`);
    const fd = openSync(temporary, constants.O_WRONLY | constants.O_NOFOLLOW);
    try {
      writeFileSync(fd, encoded);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
    temporary = undefined;
    syncDirectory(path);
  } finally {
    if (temporary) unlinkSync(temporary);
    release();
  }
}

export function syncDirectory(path: string) {
  const fd = openSync(dirname(safePath(path)), constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function acquirePrivateLock(input: string) {
  const path = safePath(input);
  privateParent(path);
  try {
    readPrivateFile(path, 65536);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
    if (readdirSync(dirname(path)).length > 1000)
      fail('SEARCH_CAPACITY', 'lock scratch directory exceeds file bound');
    const candidate = exclusiveFile(`${path}.initializing-${randomUUID()}`);
    try {
      const initialization = new DatabaseSync(candidate);
      try {
        initialization.exec(
          "CREATE TABLE ttr_search_lock(purpose TEXT PRIMARY KEY); INSERT INTO ttr_search_lock VALUES('derived-search-lock-v1')"
        );
      } finally {
        initialization.close();
      }
      const fd = openSync(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      try {
        linkSync(candidate, path);
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            'code' in error &&
            error.code === 'EEXIST'
          )
        )
          throw error;
      }
      syncDirectory(path);
    } finally {
      unlinkSync(candidate);
    }
  }
  readPrivateFile(path, 65536);
  const inspection = new DatabaseSync(path, { readOnly: true });
  try {
    validateLock(inspection);
  } finally {
    inspection.close();
  }
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE');
    validateLock(db);
    syncDirectory(path);
    return () => {
      try {
        db.exec('ROLLBACK');
      } finally {
        db.close();
      }
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

function validateLock(db: DatabaseSync) {
  const tables = z
    .array(z.object({ name: z.string() }))
    .parse(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    );
  if (tables.length !== 1 || tables[0]?.name !== 'ttr_search_lock')
    fail('CACHE_OWNERSHIP', 'lock database belongs to another store');
  z.array(z.object({ purpose: z.literal('derived-search-lock-v1') }))
    .length(1)
    .parse(db.prepare('SELECT purpose FROM ttr_search_lock').all());
}

export function readCache(path: string): SearchCache {
  const envelope = envelopeSchema.parse(
    parseJson(readPrivateFile(path).toString('utf8'))
  );
  if (digest(envelope.cache) !== envelope.hash)
    fail('INVALID_CACHE', 'derived index integrity mismatch');
  return envelope.cache;
}

export function bytesHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
