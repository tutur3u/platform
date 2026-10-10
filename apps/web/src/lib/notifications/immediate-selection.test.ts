import { describe, expect, it, vi } from 'vitest';
import {
  fetchPendingImmediateBatches,
  MAX_IMMEDIATE_BATCHES_PER_REQUEST,
} from './immediate-selection';

function fixture(count: number, failure: Error | null = null) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(i).padStart(4, '0'),
    status: 'pending',
    delivery_mode: 'immediate',
    window_end: '2026-01-01T00:00:00Z',
  }));
  let selectedIds: string[] | undefined;
  const query: Record<string, any> = {};
  for (const method of ['select', 'eq', 'order'])
    query[method] = vi.fn(() => query);
  query.in = vi.fn((_column, ids) => {
    selectedIds = ids;
    return query;
  });
  query.limit = vi.fn(async (limit) => ({
    data: rows
      .filter((row) => !selectedIds || selectedIds.includes(row.id))
      .slice(0, limit),
    error: failure,
  }));
  query.range = vi.fn(async (from, to) => ({
    data: rows.slice(from, to + 1),
    error: failure,
  }));
  const from = vi.fn(() => query);
  const schema = vi.fn(() => ({ from }));
  return { admin: { schema }, schema, from, query, rows };
}

describe('immediate notification selection budget', () => {
  it('preserves complete automatic selection across filtered queue windows', async () => {
    const f = fixture(1001);
    expect(await fetchPendingImmediateBatches(f.admin, [])).toHaveLength(1001);
    expect(f.query.range).toHaveBeenCalledTimes(2);
    expect(f.query.limit).not.toHaveBeenCalled();
  });
  it('selects one bounded explicit window and leaves other batches pending', async () => {
    const f = fixture(1001);
    const selected = await fetchPendingImmediateBatches(
      f.admin,
      f.rows.slice(0, 100).map((r) => r.id)
    );
    expect(selected).toHaveLength(MAX_IMMEDIATE_BATCHES_PER_REQUEST);
    expect(selected.at(-1)?.id).toBe('0099');
    expect(f.query.limit).toHaveBeenCalledExactlyOnceWith(100);
    expect(f.from).toHaveBeenCalledExactlyOnceWith('notification_batches');
    expect(f.schema).toHaveBeenCalledExactlyOnceWith('private');
    expect(f.query.order.mock.calls).toEqual([
      ['window_end', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(f.query.eq.mock.calls).toEqual([
      ['status', 'pending'],
      ['delivery_mode', 'immediate'],
    ]);
    expect(f.rows).toHaveLength(1001);
    expect(f.rows.every((row) => row.status === 'pending')).toBe(true);
  });

  it('repeated wakes with no progress each make just one selection read', async () => {
    const f = fixture(1001);
    for (let i = 0; i < 10; i++) {
      expect(
        await fetchPendingImmediateBatches(
          f.admin,
          f.rows.slice(0, 100).map((r) => r.id)
        )
      ).toHaveLength(100);
    }
    expect(f.query.limit).toHaveBeenCalledTimes(10);
    expect(f.rows.every((row) => row.status === 'pending')).toBe(true);
  });

  it('filters explicit IDs and deduplicates query inputs', async () => {
    const f = fixture(101);
    const rows = await fetchPendingImmediateBatches(f.admin, ['0100', '0100']);
    expect(rows.map((row) => row.id)).toEqual(['0100']);
    expect(f.query.in).toHaveBeenCalledExactlyOnceWith('id', ['0100']);
    expect(f.query.limit).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized direct requests before any database operation', async () => {
    const f = fixture(101);
    await expect(
      fetchPendingImmediateBatches(f.admin, Array(101).fill('id'))
    ).rejects.toThrow('Too many immediate batch IDs');
    expect(f.schema).not.toHaveBeenCalled();
  });

  it('propagates repeated database failures without looping or writing', async () => {
    const failure = new Error('database unavailable');
    const f = fixture(1001, failure);
    for (let i = 0; i < 3; i++) {
      await expect(
        fetchPendingImmediateBatches(f.admin, ['0000'])
      ).rejects.toBe(failure);
    }
    expect(f.query.limit).toHaveBeenCalledTimes(3);
    expect(f.rows.every((row) => row.status === 'pending')).toBe(true);
  });

  it('does not issue another read for an empty explicit queue', async () => {
    const f = fixture(0);
    expect(await fetchPendingImmediateBatches(f.admin, ['0000'])).toEqual([]);
    expect(f.query.limit).toHaveBeenCalledTimes(1);
  });
});
