import { describe, expect, it, vi } from 'vitest';
import {
  type BridgeEndpoint,
  dispatchEndpoint,
  sortEndpoints,
} from './endpoints';

const json = (body: unknown) => Response.json(body);

describe('endpoint dispatch', () => {
  const memory = { GET: vi.fn(() => json({ route: 'memory' })) };
  const meeting = {
    GET: vi.fn(
      async (_request: Request, context: { params: Promise<unknown> }) =>
        json(await context.params)
    ),
    POST: vi.fn(() => new Response('created', { status: 201 })),
  };
  const preview = {
    GET: vi.fn(
      async (_request: Request, context: { params: Promise<unknown> }) =>
        json(await context.params)
    ),
  };
  const endpoints: BridgeEndpoint[] = sortEndpoints([
    { pattern: '/api/meet-live/[meetingId]', module: meeting },
    { pattern: '/api/meet-live/memory', module: memory },
    {
      pattern: '/r/[code]/preview',
      module: preview,
      defaults: { locale: 'en' },
    },
  ]);

  it('prefers static routes and passes Next params including defaults', async () => {
    const memoryResponse = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/meet-live/memory')
    );
    expect(await memoryResponse?.json()).toEqual({ route: 'memory' });
    const meetingResponse = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/meet-live/m%201')
    );
    expect(await meetingResponse?.json()).toEqual({ meetingId: 'm 1' });
    const previewResponse = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/r/abc/preview')
    );
    expect(await previewResponse?.json()).toEqual({
      locale: 'en',
      code: 'abc',
    });
  });

  it('applies HEAD, OPTIONS, 405 and 400 semantics', async () => {
    const head = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/meet-live/m', { method: 'HEAD' })
    );
    expect(head?.status).toBe(200);
    expect(await head?.text()).toBe('');
    const options = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/meet-live/m', { method: 'OPTIONS' })
    );
    expect(options?.status).toBe(204);
    expect(options?.headers.get('allow')).toBe('GET, POST, HEAD, OPTIONS');
    const denied = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/meet-live/memory', { method: 'DELETE' })
    );
    expect(denied?.status).toBe(405);
    expect(denied?.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    const malformed = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/meet-live/%ZZ')
    );
    expect(malformed?.status).toBe(400);
  });

  it('matches an explicit app-relative pathname and returns null when unowned', async () => {
    const based = await dispatchEndpoint(
      endpoints,
      new Request('https://tuturuuu.com/meet/api/meet-live/memory'),
      { pathname: '/api/meet-live/memory' }
    );
    expect(based?.status).toBe(200);
    expect(
      await dispatchEndpoint(endpoints, new Request('https://x.test/api/other'))
    ).toBeNull();
  });
});
