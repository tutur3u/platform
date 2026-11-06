import {
  dispatchEndpoint as bridgeDispatch,
  type BridgeEndpoint as MailEndpoint,
  sortEndpoints,
} from '@tuturuuu/start-bridge/endpoints';
import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { describe, expect, it, vi } from 'vitest';

const dispatchEndpoint = (request: NextRequest, endpoints: MailEndpoint[]) =>
  bridgeDispatch(sortEndpoints(endpoints), request);

const base = 'https://mail.tuturuuu.com';
describe('native Mail endpoint dispatch', () => {
  it('selects static bulk before message identity and never falls through on 405', async () => {
    const dynamic = vi.fn(() => Response.json({ wrong: true }));
    const bulk = vi.fn(() => Response.json({ bulk: true }));
    const endpoints: MailEndpoint[] = [
      { pattern: '/mail/messages/[messageId]', module: { GET: dynamic } },
      { pattern: '/mail/messages/bulk', module: { PATCH: bulk } },
    ];
    const result = await dispatchEndpoint(
      new NextRequest(`${base}/mail/messages/bulk`, { method: 'PATCH' }),
      endpoints
    );
    expect(await result?.json()).toEqual({ bulk: true });
    expect(dynamic).not.toHaveBeenCalled();
    const denied = await dispatchEndpoint(
      new NextRequest(`${base}/mail/messages/bulk`),
      endpoints
    );
    expect(denied?.status).toBe(405);
    expect(denied?.headers.get('allow')).toBe('PATCH, OPTIONS');
    expect(dynamic).not.toHaveBeenCalled();
  });
  it('keeps raw signed bytes, query, Range and streaming responses without replay', async () => {
    const bytes = new TextEncoder().encode('{ "signature": "raw" }\n');
    const handler = vi.fn(async (request: NextRequest) => {
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
      expect(request.nextUrl.search).toBe('?revision=original');
      expect(request.headers.get('range')).toBe('bytes=2-4');
      return new Response('abc', {
        status: 206,
        headers: { 'content-range': 'bytes 2-4/5', etag: 'object' },
      });
    });
    const response = await dispatchEndpoint(
      new NextRequest(`${base}/webhook?revision=original`, {
        method: 'POST',
        body: bytes,
        headers: { range: 'bytes=2-4' },
      }),
      [{ pattern: '/webhook', module: { POST: handler } }]
    );
    expect(response?.status).toBe(206);
    expect(response?.headers.get('content-range')).toBe('bytes 2-4/5');
    expect(await response?.text()).toBe('abc');
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it('supports HEAD and OPTIONS, rejects malformed parameters, and leaves unmatched APIs to their owner', async () => {
    const get = vi.fn(
      () => new Response('body', { headers: { etag: 'version' } })
    );
    const endpoints: MailEndpoint[] = [
      { pattern: '/item/[id]', module: { GET: get } },
    ];
    const head = await dispatchEndpoint(
      new NextRequest(`${base}/item/one`, { method: 'HEAD' }),
      endpoints
    );
    expect(head?.status).toBe(200);
    expect(await head?.text()).toBe('');
    expect(head?.headers.get('etag')).toBe('version');
    const options = await dispatchEndpoint(
      new NextRequest(`${base}/item/one`, { method: 'OPTIONS' }),
      endpoints
    );
    expect(options?.status).toBe(204);
    expect(options?.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    expect(
      (await dispatchEndpoint(new NextRequest(`${base}/item/%ZZ`), endpoints))
        ?.status
    ).toBe(400);
    expect(
      await dispatchEndpoint(
        new NextRequest(`${base}/api/central-only`),
        endpoints
      )
    ).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('does not retry an unknown send outcome', async () => {
    const send = vi.fn(async () => {
      throw new Error('provider outcome unknown');
    });
    await expect(
      dispatchEndpoint(
        new NextRequest(`${base}/send`, {
          method: 'POST',
          body: 'original-operation',
        }),
        [{ pattern: '/send', module: { POST: send } }]
      )
    ).rejects.toThrow('provider outcome unknown');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
