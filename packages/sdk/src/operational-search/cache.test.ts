import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import {
  acquirePrivateLock,
  assertDerivedPath,
  readCache,
  type SearchCache,
  writeCache,
} from './cache';

function jsLiteral(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new TypeError('JavaScript literals must be JSON-serializable.');
  return serialized.replace(
    /[<>&/\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

const cache: SearchCache = {
  version: 1,
  projectionVersion: 1,
  sourceDatabaseId: '00000000-0000-4000-8000-000000000001',
  revision: 1,
  snapshotHash: 'a'.repeat(64),
  modelFingerprint: null,
  documents: [],
  vectors: [],
};

it('persists a private bounded derived index and detects corruption', () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-search-cache-'))
  );
  const path = join(directory, 'index.json');
  try {
    writeCache(path, cache);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readCache(path)).toEqual(cache);
    const content = readFileSync(path, 'utf8').replace(
      '"revision":1',
      '"revision":2'
    );
    writeFileSync(path, content);
    expect(() => readCache(path)).toThrow('integrity mismatch');
    chmodSync(path, 0o644);
    expect(() => readCache(path)).toThrow('private');
    expect(() => writeCache(path, cache)).toThrow('private');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('never adopts unrelated empty files or empty SQLite lock databases', () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-cache-empty-'))
  );
  try {
    const empty = join(directory, 'empty');
    writeFileSync(empty, '', { mode: 0o600 });
    expect(() => acquirePrivateLock(empty)).toThrow('another store');
    expect(readFileSync(empty).length).toBe(0);
    const sqlite = join(directory, 'empty.sqlite');
    writeFileSync(sqlite, '', { mode: 0o600 });
    const db = new DatabaseSync(sqlite);
    db.exec('PRAGMA user_version=7');
    db.close();
    const before = readFileSync(sqlite);
    expect(() => acquirePrivateLock(sqlite)).toThrow('another store');
    expect(readFileSync(sqlite)).toEqual(before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('refuses symlinks and a foreign cache write lock', () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-search-cache-'))
  );
  try {
    const target = join(directory, 'target');
    writeFileSync(target, 'untouched', { mode: 0o600 });
    const path = join(directory, 'index');
    symlinkSync(target, path);
    expect(() => writeCache(path, cache)).toThrow('symlink');
    const locked = join(directory, 'locked');
    writeFileSync(`${locked}.lock.sqlite`, 'foreign', { mode: 0o600 });
    expect(() => writeCache(locked, cache)).toThrow();
    expect(readFileSync(`${locked}.lock.sqlite`, 'utf8')).toBe('foreign');
    expect(readFileSync(target, 'utf8')).toBe('untouched');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('protects authoritative paths, hardlinks, sidecars and unrelated private files', () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-cache-path-'))
  );
  try {
    const db = join(directory, 'backlog.sqlite');
    writeFileSync(db, 'SQLite authoritative beforeimage', { mode: 0o600 });
    const alias = join(directory, 'alias');
    linkSync(db, alias);
    for (const target of [db, alias, `${db}-wal`, `${db}.backup`])
      expect(() => assertDerivedPath(db, target)).toThrow('source store');
    expect(() => writeCache(db, cache)).toThrow();
    expect(readFileSync(db, 'utf8')).toBe('SQLite authoritative beforeimage');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('releases SQLite-derived locks after actual child process death', async () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-cache-crash-'))
  );
  const path = join(directory, 'transfer-lock.sqlite');
  const module = join(import.meta.dirname, 'cache.ts');
  const child = spawn(
    process.env.TTR_TEST_BUN ?? 'bun',
    [
      '-e',
      `import {acquirePrivateLock} from ${jsLiteral(module)}; globalThis.keepLock = acquirePrivateLock(${jsLiteral(path)}); process.stdout.write('locked'); setInterval(()=>{},1000);`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  try {
    const data = await new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('lock fixture readiness timed out')),
        2000
      );
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', () => {
        clearTimeout(timeout);
        reject(new Error('lock fixture exited before readiness'));
      });
      child.stdout.once('data', (value: Buffer) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
    expect(String(data)).toBe('locked');
    expect(() => acquirePrivateLock(path)).toThrow();
    const closed = once(child, 'close');
    child.kill('SIGKILL');
    await closed;
    const release = acquirePrivateLock(path);
    release();
    writeCache(join(directory, 'index.json'), cache);
    expect(readCache(join(directory, 'index.json'))).toEqual(cache);
  } finally {
    child.kill('SIGKILL');
    rmSync(directory, { recursive: true, force: true });
  }
});
