import { describe, expect, it, vi } from 'vitest';
import { readSubscriptionPages } from './read-pages';

describe('complete subscription context pagination', () => {
  it.each([0, 1, 499, 500, 501, 1507])('reads all %i rows', async (count) => {
    const rows = Array.from({ length: count }, (_, id) => ({ id }));
    const fetch = vi.fn(async (offset: number, limit: number) => ({
      data: rows.slice(offset, offset + limit),
      count,
      error: null,
    }));
    expect(await readSubscriptionPages(fetch)).toEqual({
      data: rows,
      error: null,
    });
    expect(fetch).toHaveBeenCalledTimes(Math.max(1, Math.ceil(count / 500)));
  });
  it.each([
    { data: [], count: null, error: null },
    { data: [], count: 1, error: null },
    { data: null, count: 0, error: null },
    { data: [], count: 50001, error: null },
  ])('rejects incomplete or oversized reads %j', async (page) => {
    expect(await readSubscriptionPages(async () => page)).toMatchObject({
      data: null,
      error: expect.any(Error),
    });
  });
  it('discards prior pages when totals change', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array(500).fill(1),
        count: 501,
        error: null,
      })
      .mockResolvedValueOnce({ data: [2, 3], count: 502, error: null });
    expect(await readSubscriptionPages(fetch)).toMatchObject({
      data: null,
      error: expect.any(Error),
    });
  });
  it('propagates query errors without partial coverage', async () => {
    const error = new Error('database unavailable');
    expect(
      await readSubscriptionPages(async () => ({
        data: null,
        count: null,
        error,
      }))
    ).toEqual({ data: null, error });
  });
});
