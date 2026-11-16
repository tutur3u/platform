import { describe, expect, it, vi } from 'vitest';
import { readLibraryBody } from './http';

vi.mock('server-only', () => ({}));

const request = (body: string, signal?: AbortSignal) =>
  new Request(
    'https://tuturuuu.com/api/v1/workspaces/synthetic/cite/library/batch',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    }
  );

describe('bounded library request bodies', () => {
  it('uses the batch limit rather than the larger item-write limit', async () => {
    const body = JSON.stringify({ synthetic: 'x'.repeat(5000) });
    await expect(readLibraryBody(request(body), 4096)).rejects.toMatchObject({
      status: 413,
    });
    await expect(readLibraryBody(request(body))).resolves.toEqual(
      JSON.parse(body)
    );
  });

  it('keeps an aborted request from being parsed as a successful body', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readLibraryBody(request('{"ids":[]}', controller.signal), 4096)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
