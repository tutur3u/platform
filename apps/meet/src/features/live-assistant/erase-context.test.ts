import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import { eraseEndedLiveContext } from '../../../cloudflare/live/erase-context';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import { EMPTY_LIVE_JOURNAL } from './context';

function fixture() {
  const rows = new Map<string, unknown>();
  const storage = {
    put: vi.fn(async (key: string, value: unknown) => {
      rows.set(key, structuredClone(value));
    }),
    list: vi.fn(
      async ({ prefix, limit }: { prefix: string; limit: number }) =>
        new Map(
          [...rows].filter(([key]) => key.startsWith(prefix)).slice(0, limit)
        )
    ),
    delete: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) rows.delete(key);
    }),
  };
  const saved = {
    ended: true,
    handle: 'private-handle',
    sharedContext: 'private context',
    journal: {
      ...EMPTY_LIVE_JOURNAL,
      turns: [{ role: 'user', text: 'private conversation' }],
    },
    reviews: [{ text: 'private proposal' }],
    billing: { id: 'billing-receipt', costUsd: 0.25 },
  } as unknown as SavedSession;
  return {
    rows,
    storage,
    saved,
    typed: storage as unknown as DurableObjectStorage,
  };
}
describe('ended Live context erasure', () => {
  it('clears bounded pages while preserving billing and approved memory storage', async () => {
    const f = fixture(),
      retry = vi.fn(async () => {});
    for (let i = 0; i < 129; i++) f.rows.set(`turn:${i}`, { text: 'private' });
    f.rows.set('archive:sequence', 129);
    await eraseEndedLiveContext(f.typed, f.saved, retry);
    expect(retry).toHaveBeenCalledOnce();
    expect(f.saved.contextErased).toBeUndefined();
    expect(f.saved.journal).toEqual(EMPTY_LIVE_JOURNAL);
    expect(f.saved.sharedContext).toBe('');
    expect(f.saved.reviews).toEqual([]);
    expect(f.saved.handle).toBeUndefined();
    await eraseEndedLiveContext(f.typed, f.saved, retry);
    expect(f.saved.contextErased).toBe(true);
    expect([...f.rows.keys()]).toEqual(['session']);
    expect(f.saved.billing).toEqual({ id: 'billing-receipt', costUsd: 0.25 });
  });
  it('recovers an interrupted deletion without marking private context erased early', async () => {
    const f = fixture(),
      retry = vi.fn(async () => {});
    f.rows.set('turn:1', { text: 'private' });
    f.storage.delete.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(
      eraseEndedLiveContext(f.typed, f.saved, retry)
    ).rejects.toThrow();
    expect(f.saved.contextErased).toBeUndefined();
    await eraseEndedLiveContext(f.typed, f.saved, retry);
    expect(f.saved.contextErased).toBe(true);
    expect(f.rows.has('turn:1')).toBe(false);
  });
  it('does not erase an active conversation', async () => {
    const f = fixture();
    f.saved.ended = false;
    await eraseEndedLiveContext(f.typed, f.saved, vi.fn());
    expect(f.storage.put).not.toHaveBeenCalled();
  });
});
