import { describe, expect, it, vi } from 'vitest';
import {
  FEE_LOCK_VERSION_CONFLICT_CODE,
  listFeeLocks,
  lockFeeLock,
  saveFeeLockDraft,
} from './finance-fee-lock';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const draft = {
  student_id: id(1),
  month: '2026-12',
  lines: [{ kind: 'tuition' as const, group_id: id(2), quantity: 8 }],
};
const mockFetch = (body: unknown, status = 200) =>
  vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('fee-lock client', () => {
  const options = (fetch: typeof globalThis.fetch) => ({
    baseUrl: 'https://finance.example',
    fetch,
  });

  it('lists fee locks for a month without caching', async () => {
    const fetch = mockFetch({ data: [], count: 0, currency: 'VND' });
    await listFeeLocks(
      'ws/one',
      { month: '2026-12', status: 'draft', page: 2 },
      options(fetch)
    );
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v1/workspaces/ws%2Fone/finance/fee-locks');
    expect(url.searchParams.get('month')).toBe('2026-12');
    expect(url.searchParams.get('page')).toBe('2');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('returns a typed conflict on 409 instead of throwing', async () => {
    const current = { id: id(9), version: 4 };
    const fetch = mockFetch(
      { code: FEE_LOCK_VERSION_CONFLICT_CODE, message: 'conflict', current },
      409
    );
    const result = await lockFeeLock(
      'ws',
      id(9),
      { expected_version: 3 },
      options(fetch)
    );
    expect(result).toEqual({
      ok: false,
      conflict: expect.objectContaining({ current }),
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://finance.example/api/v1/workspaces/ws/finance/fee-locks/${id(9)}/lock`,
      expect.objectContaining({
        method: 'POST',
        body: '{"expected_version":3}',
      })
    );
  });

  it('throws other errors and resolves successes', async () => {
    const fail = mockFetch({ error: 'Not found' }, 404);
    await expect(
      saveFeeLockDraft('ws', draft, options(fail))
    ).rejects.toMatchObject({ status: 404 });
    const ok = mockFetch({ lock: { id: id(9) } });
    await expect(saveFeeLockDraft('ws', draft, options(ok))).resolves.toEqual({
      ok: true,
      data: { lock: { id: id(9) } },
    });
    expect(ok.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' });
  });
});
