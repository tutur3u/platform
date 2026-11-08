import { describe, expect, it, vi } from 'vitest';
import { exportFeeLocks } from './finance-fee-lock';

const options = (fetch: typeof globalThis.fetch) => ({
  baseUrl: 'https://finance.example',
  fetch,
});
const respond = (response: Response) =>
  vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);

describe('exportFeeLocks', () => {
  it('posts the filters and returns the workbook, its name and row count', async () => {
    const fetch = respond(
      new Response(new Uint8Array([80, 75]), {
        headers: {
          'content-disposition':
            'attachment; filename="chot-hoc-phi-2026-12-0000000a.xlsx"',
          'x-fee-lock-row-count': '12',
        },
      })
    );
    const result = await exportFeeLocks(
      'ws/one',
      { month: '2026-12', status: 'all' },
      options(fetch)
    );
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(new URL(String(url)).pathname).toBe(
      '/api/v1/workspaces/ws%2Fone/finance/fee-locks/export'
    );
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' });
    expect(JSON.parse(String(init?.body))).toEqual({
      month: '2026-12',
      status: 'all',
    });
    expect(result).toMatchObject({
      ok: true,
      fileName: 'chot-hoc-phi-2026-12-0000000a.xlsx',
      rowCount: 12,
    });
    expect(result.ok && result.blob.size).toBe(2);
  });

  it('reports too many rows and throws other errors', async () => {
    const tooMany = respond(
      Response.json(
        { code: 'FEE_LOCK_EXPORT_TOO_MANY', count: 2001 },
        { status: 400 }
      )
    );
    expect(
      await exportFeeLocks('ws', { month: '2026-12' }, options(tooMany))
    ).toEqual({ ok: false, tooMany: 2001 });
    const denied = respond(Response.json({ message: 'nope' }, { status: 403 }));
    await expect(
      exportFeeLocks('ws', { month: '2026-12' }, options(denied))
    ).rejects.toMatchObject({ status: 403 });
  });

  it('never takes a file name with unexpected characters from the response', async () => {
    const fetch = respond(
      new Response('x', {
        headers: {
          'content-disposition': 'attachment; filename="../evil.exe"',
        },
      })
    );
    const result = await exportFeeLocks(
      'ws',
      { month: '2026-12' },
      options(fetch)
    );
    expect(result).toMatchObject({
      ok: true,
      fileName: 'chot-hoc-phi.xlsx',
      rowCount: 0,
    });
  });
});
