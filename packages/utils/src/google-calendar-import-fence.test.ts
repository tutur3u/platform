import type { calendar_v3 } from '@tuturuuu/google';
import type { SupabaseClient } from '@tuturuuu/supabase';
import { describe, expect, it, vi } from 'vitest';
import {
  applyGoogleImport,
  captureGoogleImport,
  GoogleImportFenceError,
  replayDeferredGoogleImports,
} from './google-calendar-import-fence';

const scope = {
  wsId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  calendarId: 'calendar',
  authTokenId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
};
const capture = { ...scope, id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc' };
const result = { inserted: 0, updated: 1, deleted: 0, deferred: 0 };

function fixture(providerEvent: unknown = { id: 'event', summary: 'fresh' }) {
  const order: string[] = [];
  const rpc = vi.fn(
    async (
      name: string,
      _args: Record<string, unknown>
    ): Promise<{ data: unknown; error: null }> => {
      order.push(name);
      return {
        data:
          name === 'list_deferred_calendar_google_imports'
            ? ['event']
            : name === 'capture_calendar_google_import'
              ? capture
              : result,
        error: null,
      };
    }
  );
  const get = vi.fn(async () => {
    order.push('get');
    return { data: providerEvent };
  });
  const format = vi.fn(async (events: unknown[]) => events as object[]);
  const client = { rpc } as unknown as SupabaseClient;
  const calendar = { events: { get } } as unknown as calendar_v3.Calendar;
  return { client, calendar, scope, format, order, rpc, get };
}

describe('guarded Google import boundaries', () => {
  it('captures before the fresh provider read and persists before returning', async () => {
    const f = fixture();
    await replayDeferredGoogleImports(f);
    expect(f.order).toEqual([
      'list_deferred_calendar_google_imports',
      'capture_calendar_google_import',
      'get',
      'apply_calendar_google_import',
    ]);
    expect(f.rpc.mock.calls[2]?.[1]).toEqual({
      p_capture_id: capture.id,
      p_events: [{ id: 'event', summary: 'fresh' }],
      p_tombstones: [],
    });
  });
  it('rejects a capture scoped to another account before any provider read', async () => {
    const f = fixture();
    f.rpc.mockImplementation(async (name) => ({
      data:
        name === 'list_deferred_calendar_google_imports'
          ? ['event']
          : { ...capture, authTokenId: null },
      error: null,
    }));
    await expect(replayDeferredGoogleImports(f)).rejects.toBeInstanceOf(
      GoogleImportFenceError
    );
    expect(f.get).not.toHaveBeenCalled();
  });
  it('does not apply an unexpected provider event identity', async () => {
    const f = fixture({ id: 'another-event' });
    await expect(replayDeferredGoogleImports(f)).rejects.toBeInstanceOf(
      GoogleImportFenceError
    );
    expect(f.format).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it('converts only a verified 404 to a scoped tombstone', async () => {
    const f = fixture();
    f.get.mockRejectedValue({ response: { status: 404 } });
    await replayDeferredGoogleImports(f);
    expect(f.rpc.mock.calls[2]?.[1]).toEqual({
      p_capture_id: capture.id,
      p_events: [],
      p_tombstones: ['event'],
    });
    expect(f.format).not.toHaveBeenCalled();
  });
  it('leaves deletion-disabled entries queued without an apply', async () => {
    const f = fixture({ id: 'event', status: 'cancelled' });
    expect(
      await replayDeferredGoogleImports({ ...f, syncDeletes: false })
    ).toEqual({ deferred: 1 });
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it('propagates provider failure without tombstones or persistence', async () => {
    const f = fixture();
    const failure = new Error('provider unavailable');
    f.get.mockRejectedValue(failure);
    await expect(replayDeferredGoogleImports(f)).rejects.toBe(failure);
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it('fails on optional-looking malformed persistence rather than advancing sync', async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ data: { ...result, deferred: -1 }, error: null });
    await expect(
      applyGoogleImport(f.client, capture, [])
    ).rejects.toBeInstanceOf(GoogleImportFenceError);
  });
  it('rejects malformed capture state', async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ data: {}, error: null });
    await expect(captureGoogleImport(f.client, scope)).rejects.toBeInstanceOf(
      GoogleImportFenceError
    );
  });
});
