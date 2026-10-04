import { afterEach, expect, it, vi } from 'vitest';
import { listTutoringTeachers } from './tutoring';

afterEach(() => vi.unstubAllGlobals());
it('uses the shared API transport with bounded teacher query and no-store caching', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ data: [], count: 0, page: 2, pageSize: 20, totalPages: 0 })
  );
  vi.stubGlobal('fetch', fetch);
  await listTutoringTeachers(
    'center',
    { page: 2, pageSize: 20, q: 'Teacher' },
    { baseUrl: 'https://api.example.com' }
  );
  expect(String(fetch.mock.calls[0]?.[0])).toBe(
    'https://api.example.com/api/v1/workspaces/center/tutoring/teachers?page=2&pageSize=20&q=Teacher'
  );
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
});
