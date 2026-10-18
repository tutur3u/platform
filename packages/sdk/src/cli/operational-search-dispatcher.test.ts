import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { initStore, OperationalStore } from './operational-store';

let root: string;
const runtime = process.env.TTR_TEST_BUN ?? 'bun';
const entry = resolve(import.meta.dirname, 'index.ts');
const resultSchema = z
  .object({ liveVerificationPerformed: z.literal(false) })
  .passthrough();
beforeEach(() => {
  root = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-search-dispatch-synthetic-'))
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function run(args: string[], expected = 0) {
  const result = spawnSync(runtime, [entry, ...args, '--json'], {
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      HOME: join(root, 'synthetic-home'),
      TUTURUUU_CONFIG: join(root, 'no-auth-config.json'),
      TUTURUUU_API_URL: 'http://127.0.0.1:1',
      TUTURUUU_DISABLE_UPDATE_CHECK: '1',
    },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(expected);
  expect(result.stderr).toBe('');
  expect(result.stdout.trim().split('\n')).toHaveLength(1);
  const parsed: unknown = JSON.parse(result.stdout);
  return resultSchema.parse(parsed);
}
function seed() {
  const path = join(root, 'synthetic-backlog.sqlite');
  initStore(path, 'backlog');
  const store = new OperationalStore(path, 'backlog', true);
  try {
    store.intake(
      [
        {
          id: 'calendar-rsvp',
          title: 'Calendar RSVP lịch họp',
          kind: 'feature',
          source: 'synthetic:dispatcher',
          acceptance: 'Keep RSVP changes',
          requiredEvidence: ['focused'],
        },
      ],
      { expectedRevision: 0, operationId: randomUUID() }
    );
  } finally {
    store.close();
  }
  return path;
}

it('routes source-native search help in both languages before auth or store access', () => {
  for (const lang of ['en', 'vi']) {
    expect(run(['backlog', 'search', 'help', '--lang', lang])).toMatchObject({
      ok: true,
      group: 'backlog search',
      commands: ['query', 'index', 'model-status', 'model-prepare'],
    });
  }
  expect(existsSync(join(root, 'no-auth-config.json'))).toBe(false);
  expect(
    existsSync(join(root, 'synthetic-home', '.local', 'share', 'tuturuuu'))
  ).toBe(false);
});

it('routes model-status without loading, downloading or probing a model runtime', () => {
  expect(run(['backlog', 'search', 'model-status'])).toMatchObject({
    ok: true,
    ready: false,
    downloadPerformed: false,
    runtimeExecuted: false,
    runtimeProbePerformed: false,
    modelLoaded: false,
  });
});

it('forwards query text and flags to lexical search and preserves the source bytes', () => {
  const path = seed();
  const before = readFileSync(path);
  const response = run([
    'backlog',
    'search',
    'query',
    'RSVP lịch',
    '--db',
    path,
    '--mode',
    'lexical',
    '--limit',
    '1',
  ]);
  expect(response).toMatchObject({
    ok: true,
    mode: 'lexical',
    requestedMode: 'lexical',
    results: [
      {
        id: 'calendar-rsvp',
        canonicalId: 'calendar-rsvp',
        duplicateCandidate: 'uncertain',
        actionAuthorized: false,
      },
    ],
  });
  expect(readFileSync(path)).toEqual(before);
});

it('awaits a derived lexical index and keeps hybrid fallback honest through the real dispatcher', () => {
  const path = seed();
  const before = readFileSync(path);
  const cache = join(root, 'derived-index.json');
  expect(
    run(['backlog', 'search', 'index', '--db', path, '--cache', cache])
  ).toMatchObject({
    ok: true,
    indexed: 1,
    embedded: 0,
    incremental: false,
    runtimeKind: 'none',
    modelLoaded: false,
  });
  expect(existsSync(cache)).toBe(true);
  expect(
    run(['backlog', 'search', 'query', 'RSVP', '--db', path, '--cache', cache])
  ).toMatchObject({
    ok: true,
    cacheStatus: 'current',
    mode: 'lexical',
    requestedMode: 'hybrid',
    fallbackReason: 'SEMANTIC_UNAVAILABLE',
    results: [{ id: 'calendar-rsvp', actionAuthorized: false }],
  });
  expect(readFileSync(path)).toEqual(before);
});

it('preserves the existing async error envelope and exit code for rejected search commands', () => {
  expect(run(['backlog', 'search', 'query', 'RSVP'], 2)).toMatchObject({
    error: {
      code: 'INVALID_INPUT',
      message: '--db is required; search never initializes or adopts a store',
    },
  });
  expect(run(['backlog', 'search', 'model-prepare'], 2)).toMatchObject({
    error: { code: 'INVALID_INPUT' },
  });
  expect(existsSync(join(root, 'no-auth-config.json'))).toBe(false);
});

it('keeps non-search backlog and operational-memory fallback behavior unchanged', () => {
  expect(run(['backlog', 'help'])).toMatchObject({
    version: 1,
    group: 'backlog',
  });
  expect(run(['operational-memory', 'help'])).toMatchObject({
    version: 1,
    group: 'operational-memory',
  });
  const path = seed();
  expect(run(['backlog', 'snapshot', '--db', path])).toMatchObject({
    revision: 1,
    items: [{ id: 'calendar-rsvp', status: 'captured' }],
  });
});
