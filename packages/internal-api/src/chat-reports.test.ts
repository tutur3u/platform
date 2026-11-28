import { describe, expect, it, vi } from 'vitest';
import { listChatReports, reviewChatReport } from './chat-reports';

const baseUrl = 'https://reports.example.test';
const optionsFor = (fetchMock: typeof fetch) => ({
  baseUrl,
  fetch: fetchMock,
  defaultHeaders: { Authorization: 'Bearer synthetic-token' },
});

describe('staff chat report queue', () => {
  it('lists with status and limit filters through an uncached GET', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ reports: [] })
    );
    expect(
      await listChatReports(
        { status: 'reviewing', limit: 20 },
        optionsFor(fetchMock)
      )
    ).toEqual({ reports: [] });
    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/api/v1/chat-reports');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      status: 'reviewing',
      limit: '20',
    });
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer synthetic-token'
    );
  });

  it('omits the query string when no filter is given', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ reports: [] })
    );
    await listChatReports({}, optionsFor(fetchMock));
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${baseUrl}/api/v1/chat-reports`
    );
  });

  it('sends a PATCH review with a trimmed note and drops a blank one', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ ok: true })
    );
    const options = optionsFor(fetchMock);
    const reportId = '11111111-1111-4111-8111-111111111111';
    await reviewChatReport(
      { reportId, status: 'actioned', note: '  removed content  ' },
      options
    );
    await reviewChatReport(
      { reportId, status: 'dismissed', note: '   ' },
      options
    );
    const bodies = fetchMock.mock.calls.map(([url, init]) => {
      expect(String(url)).toBe(`${baseUrl}/api/v1/chat-reports`);
      expect(init?.method).toBe('PATCH');
      expect(init?.cache).toBe('no-store');
      return JSON.parse(init?.body as string);
    });
    expect(bodies).toEqual([
      { reportId, status: 'actioned', note: 'removed content' },
      { reportId, status: 'dismissed' },
    ]);
  });

  it.each([401, 403, 503])(
    'propagates HTTP %s instead of returning an empty queue',
    async (status) => {
      const options = optionsFor(
        vi.fn(async () => Response.json({ message: 'denied' }, { status }))
      );
      await expect(listChatReports({}, options)).rejects.toMatchObject({
        status,
      });
      await expect(
        reviewChatReport(
          { reportId: 'synthetic', status: 'reviewing' },
          options
        )
      ).rejects.toMatchObject({ status });
    }
  );
});
