import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  key: vi.fn(),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: mocks.encrypt,
  decryptEventFromStorage: mocks.decrypt,
  getWorkspaceKey: mocks.key,
}));

import {
  CreateSeriesSchema,
  MutateSeriesSchema,
  type StoredSeries,
} from './schema';
import {
  callSeries,
  createSeries,
  expandSeriesList,
  hydrateSeries,
  mutateSeries,
} from './service';

const wsId = '00000000-0000-4000-8000-000000009811';
const id = '00000000-0000-4000-8000-000000009831';
const requestId = '00000000-0000-4000-8000-000000009821';
const rule = {
  version: 1 as const,
  frequency: 'daily' as const,
  interval: 1,
  timeZone: 'UTC',
  end: { type: 'count' as const, count: 5 },
};
const anchor = {
  startLocal: '2026-10-05T09:00:00',
  endLocal: '2026-10-05T10:00:00',
  allDay: false,
};
const series: StoredSeries = {
  id,
  ws_id: wsId,
  workspace_calendar_id: null,
  revision: 1,
  rule,
  anchor,
  payload: {
    title: 'Fixture',
    description: '',
    color: 'BLUE',
    is_encrypted: false,
  },
  exceptions: [],
};
const client = { rpc: mocks.rpc } as unknown as TypedSupabaseClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.encrypt.mockImplementation(async (_ws, payload) => ({
    ...payload,
    is_encrypted: true,
  }));
  mocks.decrypt.mockImplementation(async (payload) => payload);
  mocks.key.mockResolvedValue(Buffer.from('fixture'));
  mocks.rpc.mockImplementation(async (_rpc, args) => ({
    data:
      args.p_action === 'receipt'
        ? null
        : args.p_action === 'read'
          ? series
          : { id },
    error: null,
  }));
});
describe('native recurrence persistence orchestration', () => {
  it('binds idempotency to plaintext intent before randomized encryption', async () => {
    const input = CreateSeriesSchema.parse({
      requestId,
      rule,
      anchor,
      event: { title: 'Fixture' },
    });
    await createSeries(client, wsId, input);
    const mutation = mocks.rpc.mock.calls[1]![1];
    expect(mutation.p_input.intentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mutation.p_input.payload.is_encrypted).toBe(true);
    mocks.rpc.mockResolvedValueOnce({ data: { id, revision: 1 }, error: null });
    expect(await createSeries(client, wsId, input)).toEqual({
      id,
      revision: 1,
    });
    expect(mocks.encrypt).toHaveBeenCalledTimes(1);
  });
  it('returns completed mutation receipt before stale revision check', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id, revision: 2 }, error: null });
    const result = await mutateSeries(
      client,
      wsId,
      id,
      MutateSeriesSchema.parse({
        requestId,
        expectedRevision: 1,
        scope: 'all',
        event: { title: 'Updated' },
      }),
      'update'
    );
    expect(result).toEqual({ id, revision: 2 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects stale revision before encrypting or writing', async () => {
    await expect(
      mutateSeries(
        client,
        wsId,
        id,
        MutateSeriesSchema.parse({
          requestId,
          expectedRevision: 3,
          scope: 'all',
        }),
        'delete'
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.encrypt).not.toHaveBeenCalled();
  });
  it('future split preserves remaining count and wall clock duration', async () => {
    await mutateSeries(
      client,
      wsId,
      id,
      MutateSeriesSchema.parse({
        requestId,
        expectedRevision: 1,
        scope: 'future',
        originalStartLocal: '2026-10-07T09:00:00',
        event: { title: 'New' },
      }),
      'update'
    );
    const request = mocks.rpc.mock.calls.at(-1)![1].p_input;
    expect(request.previousRule.end).toEqual({
      type: 'until',
      date: '2026-10-06',
    });
    expect(request.rule.end).toEqual({ type: 'count', count: 3 });
    expect(request.anchor).toEqual({
      ...anchor,
      startLocal: '2026-10-07T09:00:00',
      endLocal: '2026-10-07T10:00:00',
    });
  });
  it('first occurrence future deletion becomes all-series deletion', async () => {
    await mutateSeries(
      client,
      wsId,
      id,
      MutateSeriesSchema.parse({
        requestId,
        expectedRevision: 1,
        scope: 'future',
        originalStartLocal: anchor.startLocal,
      }),
      'delete'
    );
    expect(mocks.rpc.mock.calls.at(-1)![1].p_input.scope).toBe('all');
  });
  it('invalid slot never persists an exception', async () => {
    await expect(
      mutateSeries(
        client,
        wsId,
        id,
        MutateSeriesSchema.parse({
          requestId,
          expectedRevision: 1,
          scope: 'this',
          originalStartLocal: '2026-10-10T09:00:00',
        }),
        'delete'
      )
    ).rejects.toThrow('Not a series occurrence');
    expect(
      mocks.rpc.mock.calls.every(([, args]) =>
        ['receipt', 'read'].includes(args.p_action)
      )
    ).toBe(true);
  });
  it('preserves existing occurrence fields when changing only title', async () => {
    mocks.rpc.mockImplementation(async (_rpc, args) => ({
      data:
        args.p_action === 'receipt'
          ? null
          : args.p_action === 'read'
            ? {
                ...series,
                exceptions: [
                  {
                    originalStartLocal: '2026-10-06T09:00:00',
                    exception: {
                      startLocal: '2026-10-06T12:00:00',
                      endLocal: '2026-10-06T13:00:00',
                    },
                    payload: { ...series.payload, description: 'Override' },
                  },
                ],
              }
            : { id },
      error: null,
    }));
    await mutateSeries(
      client,
      wsId,
      id,
      MutateSeriesSchema.parse({
        requestId,
        expectedRevision: 1,
        scope: 'this',
        originalStartLocal: '2026-10-06T09:00:00',
        event: { title: 'Renamed' },
      }),
      'update'
    );
    const request = mocks.rpc.mock.calls.at(-1)![1].p_input;
    expect(request.exception.startLocal).toBe('2026-10-06T12:00:00');
    expect(request.payload.description).toBe('Override');
  });
  it('fails encrypted reads closed if workspace key is absent', async () => {
    mocks.key.mockResolvedValue(null);
    await expect(
      hydrateSeries({
        ...series,
        payload: { ...series.payload, is_encrypted: true },
      })
    ).rejects.toMatchObject({ status: 503, code: 'ENCRYPTION_UNAVAILABLE' });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it.each([
    ['42501', 403],
    ['40001', 409],
    ['P0002', 404],
    ['PGRST202', 503],
  ])('maps database %s to HTTP %s', async (code, status) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: 'Synthetic failure' },
    });
    await expect(callSeries(client, wsId, 'read', {})).rejects.toMatchObject({
      status,
    });
  });
});
describe('virtual occurrence reads', () => {
  it('uses immutable stable UUIDs even when an occurrence moves', async () => {
    const original = await expandSeriesList([series], {
      from: '2026-10-05T00:00:00Z',
      to: '2026-10-10T00:00:00Z',
      limit: 1000,
    });
    const moved = await expandSeriesList(
      [
        {
          ...series,
          exceptions: [
            {
              originalStartLocal: anchor.startLocal,
              exception: {
                startLocal: '2026-10-06T15:00:00',
                endLocal: '2026-10-06T16:00:00',
              },
              payload: null,
            },
          ],
        },
      ],
      { from: '2026-10-05T00:00:00Z', to: '2026-10-10T00:00:00Z', limit: 1000 }
    );
    expect(
      moved.find((e) => e.originalStartLocal === anchor.startLocal)?.id
    ).toBe(original[0]?.id);
    expect(original).toHaveLength(5);
  });
  it('does not claim a truncated list is complete', async () => {
    await expect(
      expandSeriesList([series], {
        from: '2026-10-05T00:00:00Z',
        to: '2026-10-10T00:00:00Z',
        limit: 2,
      })
    ).rejects.toMatchObject({ status: 422 });
  });
  it('cancellations consume count while hiding their generated slot', async () => {
    const result = await expandSeriesList(
      [
        {
          ...series,
          exceptions: [
            {
              originalStartLocal: anchor.startLocal,
              exception: { cancelled: true },
              payload: null,
            },
          ],
        },
      ],
      { from: '2026-10-05T00:00:00Z', to: '2026-10-12T00:00:00Z', limit: 1000 }
    );
    expect(result).toHaveLength(4);
    expect(result.at(-1)?.originalStartLocal).toBe('2026-10-09T09:00:00');
  });
});
