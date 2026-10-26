import { describe, expect, it, vi } from 'vitest';
import {
  createStorageAccessAuditor,
  createStorageAccessAuditScope,
  ROOT_LEVEL_PATH_ROOT,
  type StorageAccessAuditEvent,
  type StorageAccessAuditRow,
  storageAccessOutcomeFromStatus,
  toStorageAccessAuditRow,
} from './storage-access-audit';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OBJECT = '33333333-3333-4333-8333-333333333333';
const ROUTE = '/api/v1/workspaces/[wsId]/storage/share';
const KEY = 'synthetic-audit-hmac-key-0123456789abcdef';
const keyed = { objectHashKey: KEY };

const event = (
  overrides: Partial<StorageAccessAuditEvent> = {}
): StorageAccessAuditEvent => ({
  action: 'share',
  actorId: USER,
  outcome: 'allowed',
  path: 'Finance/Salaries 2026.xlsx',
  route: ROUTE,
  wsId: WS,
  ...overrides,
});

async function hmac(value: string, key = KEY) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(value)
  );
  return Buffer.from(signature).toString('hex');
}

describe('toStorageAccessAuditRow', () => {
  it('keeps the root and a keyed hash of the full name, never the file name', async () => {
    const row = await toStorageAccessAuditRow(event(), keyed);
    expect(row).toEqual({
      action: 'share',
      actor_id: USER,
      actor_kind: 'user',
      item_count: 1,
      object_hash: await hmac(`${WS}/Finance/Salaries 2026.xlsx`),
      object_id: null,
      outcome: 'allowed',
      path_root: 'finance',
      route: ROUTE,
      ws_id: WS,
    });
    expect(JSON.stringify(row)).not.toMatch(/Salaries|xlsx/);
  });

  it('never stores an unkeyed hash that guessed names could be tested against', async () => {
    const unsalted = Buffer.from(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${WS}/Finance/Salaries 2026.xlsx`)
      )
    ).toString('hex');
    for (const options of [
      {},
      { objectHashKey: null },
      { objectHashKey: 'short' },
    ]) {
      const row = await toStorageAccessAuditRow(event(), options);
      expect(row).toMatchObject({ object_hash: null, path_root: 'finance' });
    }
    const keyedRow = await toStorageAccessAuditRow(event(), keyed);
    expect(keyedRow?.object_hash).not.toBe(unsalted);
    expect(
      (
        await toStorageAccessAuditRow(event(), {
          objectHashKey: `${KEY}-rotated`,
        })
      )?.object_hash
    ).not.toBe(keyedRow?.object_hash);
  });

  it('accepts full object names and prefers the object id over a hash', async () => {
    const row = await toStorageAccessAuditRow(
      event({ objectId: OBJECT, path: `${WS}/chats/ai/resources/x/a.png` }),
      keyed
    );
    expect(row).toMatchObject({
      object_hash: null,
      object_id: OBJECT,
      path_root: 'chats',
    });
  });

  it('marks root-level files without leaking their name', async () => {
    const row = await toStorageAccessAuditRow(
      event({ path: 'secret-plan.pdf' })
    );
    expect(row?.path_root).toBe(ROOT_LEVEL_PATH_ROOT);
    expect(JSON.stringify(row)).not.toContain('secret-plan');
  });

  it('treats a single-segment listing path as a folder root', async () => {
    const row = await toStorageAccessAuditRow(
      event({ action: 'list', kind: 'folder', path: 'Docs' }),
      keyed
    );
    expect(row?.path_root).toBe('docs');
    expect(row?.object_hash).toBe(await hmac(`${WS}/Docs/`));
  });

  it('records API key and anonymous actors and drops non-uuid ids', async () => {
    expect(
      await toStorageAccessAuditRow(event({ actorKind: 'api_key' }))
    ).toMatchObject({ actor_id: USER, actor_kind: 'api_key' });
    expect(
      await toStorageAccessAuditRow(
        event({ actorId: 'email@example.com', wsId: 'personal' })
      )
    ).toMatchObject({ actor_id: null, actor_kind: 'anonymous', ws_id: null });
  });

  it('bounds item counts and root length', async () => {
    expect(
      (await toStorageAccessAuditRow(event({ itemCount: 5000 })))?.item_count
    ).toBe(1000);
    expect(
      (await toStorageAccessAuditRow(event({ itemCount: -3 })))?.item_count
    ).toBe(0);
    expect(
      (await toStorageAccessAuditRow(event({ path: `${'r'.repeat(90)}/a` })))
        ?.path_root
    ).toHaveLength(64);
  });

  it.each([
    ['unknown action', { action: 'read' as never }],
    ['unknown outcome', { outcome: 'maybe' as never }],
    ['URL instead of route', { route: 'https://evil.test/api/x' }],
    ['query string in route', { route: '/api/x?path=report.pdf' }],
    ['overlong route', { route: `/api/${'x'.repeat(200)}` }],
  ])('rejects %s', async (_, overrides) => {
    expect(await toStorageAccessAuditRow(event(overrides))).toBeNull();
  });
});

describe('storageAccessOutcomeFromStatus', () => {
  it.each([
    [200, 'allowed'],
    [307, 'allowed'],
    [400, 'invalid'],
    [404, 'invalid'],
    [401, 'denied'],
    [403, 'denied'],
    [500, 'error'],
    [503, 'error'],
  ])('maps %i to %s', (status, outcome) => {
    expect(storageAccessOutcomeFromStatus(status)).toBe(outcome);
  });
});

describe('createStorageAccessAuditor', () => {
  it('returns immediately and writes in the background', async () => {
    let release!: () => void;
    const insert = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve))
    );
    const schedule = vi.fn();
    const auditor = createStorageAccessAuditor({ insert, schedule });

    auditor.record(event());

    expect(auditor.stats().pending).toBe(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Promise));
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    release();
    await auditor.settled();
    expect(auditor.stats()).toEqual({ dropped: 0, pending: 0, written: 1 });
  });

  it('never throws or rejects when the sink fails', async () => {
    const onError = vi.fn(() => {
      throw new Error('reporter broke too');
    });
    const auditor = createStorageAccessAuditor({
      insert: () => Promise.reject(new Error('relation does not exist')),
      onError,
    });

    expect(() => auditor.record(event())).not.toThrow();
    await auditor.settled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'relation does not exist' })
    );
  });

  it('keeps every object of a 100-path batch by default', async () => {
    const insert = vi.fn(async () => undefined);
    const auditor = createStorageAccessAuditor({ insert });
    auditor.record(
      Array.from({ length: 101 }, (_, index) =>
        event({ outcome: 'denied', path: `docs/${index}.pdf` })
      )
    );
    await auditor.settled();
    expect(
      (insert.mock.calls[0] as unknown as [StorageAccessAuditRow[]])[0]
    ).toHaveLength(100);
    expect(auditor.stats().dropped).toBe(1);
  });

  it('drops events beyond the pending-write and per-call bounds', async () => {
    const insert = vi.fn(() => new Promise<void>(() => undefined));
    const auditor = createStorageAccessAuditor({
      insert,
      maxEventsPerRecord: 2,
      maxPendingWrites: 1,
      dedupeWindowMs: 0,
    });

    auditor.record([event(), event(), event()]);
    auditor.record(event({ outcome: 'denied' }));

    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(
      (insert.mock.calls[0] as unknown as [StorageAccessAuditRow[]])[0]
    ).toHaveLength(2);
    expect(auditor.stats()).toMatchObject({ dropped: 2, pending: 1 });
  });

  it('de-duplicates repeated allowed events but always records denials', async () => {
    let now = 0;
    const rows: StorageAccessAuditRow[] = [];
    const auditor = createStorageAccessAuditor({
      insert: async (batch) => {
        rows.push(...batch);
      },
      now: () => now,
    });

    auditor.record(event());
    auditor.record(event());
    auditor.record(event({ outcome: 'denied' }));
    auditor.record(event({ outcome: 'denied' }));
    now = 60_001;
    auditor.record(event());
    await auditor.settled();

    expect(rows.map((row) => row.outcome)).toEqual([
      'allowed',
      'denied',
      'denied',
      'allowed',
    ]);
  });

  it('bounds the de-duplication memory', async () => {
    const insert = vi.fn(async () => undefined);
    const auditor = createStorageAccessAuditor({ dedupeMaxKeys: 2, insert });
    auditor.record(event({ path: 'a/1' }));
    auditor.record(event({ path: 'a/2' }));
    auditor.record(event({ path: 'a/3' }));
    // a/1 was evicted, so it is recorded again.
    auditor.record(event({ path: 'a/1' }));
    await auditor.settled();
    expect(insert).toHaveBeenCalledTimes(4);
  });
});

describe('createStorageAccessAuditScope', () => {
  it('records one event from the final status with values set during the request', () => {
    const record = vi.fn();
    const scope = createStorageAccessAuditScope(
      { record },
      { action: 'delete', route: '/api/v1/workspaces/[wsId]/storage/object' }
    );
    scope.set({ actorId: USER, wsId: WS });
    scope.set({ path: 'docs/a.pdf' });
    const response = { status: 403 };

    expect(scope.finish(response)).toBe(response);
    expect(record).toHaveBeenCalledExactlyOnceWith({
      action: 'delete',
      actorId: USER,
      outcome: 'denied',
      path: 'docs/a.pdf',
      route: '/api/v1/workspaces/[wsId]/storage/object',
      wsId: WS,
    });
  });

  it('records nothing after skip()', () => {
    const record = vi.fn();
    const scope = createStorageAccessAuditScope(
      { record },
      { action: 'share', route: ROUTE }
    );
    scope.skip();
    scope.finish({ status: 200 });
    expect(record).not.toHaveBeenCalled();
  });
});
