import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connection: vi.fn() }));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: mocks.connection };
});

import { createLegacyGetHandler, createLegacyHeadHandler } from './head';

describe('legacy route request-time adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
  });

  it('establishes request time before delegating GET arguments', async () => {
    const get = vi.fn(async (request: Request) =>
      Response.json({ path: new URL(request.url).pathname })
    );
    const handler = createLegacyGetHandler(get);

    const response = await handler(new Request('http://localhost/example'));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      get.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    await expect(response?.json()).resolves.toEqual({ path: '/example' });
  });

  it('does not invoke the legacy GET when the request-time gate rejects', async () => {
    const error = new Error('request unavailable');
    const get = vi.fn();
    mocks.connection.mockRejectedValue(error);

    await expect(createLegacyGetHandler(get)()).rejects.toBe(error);
    expect(get).not.toHaveBeenCalled();
  });

  it('builds a bodyless HEAD response from the request-time GET adapter', async () => {
    const get = createLegacyGetHandler(async () =>
      Response.json({ ok: true }, { status: 202, statusText: 'Accepted' })
    );

    const response = await createLegacyHeadHandler(get)();

    expect(response?.status).toBe(202);
    expect(response?.statusText).toBe('Accepted');
    expect(await response?.text()).toBe('');
  });
});
