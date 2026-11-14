import { describe, expect, it, vi } from 'vitest';
import { type ForwardOptions, forwardToCentralApi } from './api-forward';

describe('central API forwarding', () => {
  it('preserves method, body, raw query, cookies and every Set-Cookie', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe(
        'https://central.example/api/v1/workspaces/w?tag=1&tag=2'
      );
      expect(request.method).toBe('PATCH');
      expect(request.redirect).toBe('manual');
      expect(request.headers.get('cookie')).toBe('a=1');
      expect(request.headers.get('connection')).toBeNull();
      expect(request.headers.get('host')).toBeNull();
      expect(await request.text()).toBe('{"title":"exact"}');
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('Set-Cookie', 'a=1; Path=/');
      headers.append('Set-Cookie', 'b=2; Path=/');
      headers.set('Location', '/elsewhere');
      headers.set('Transfer-Encoding', 'chunked');
      return new Response('{"denied":true}', { status: 403, headers });
    });
    const response = await forwardToCentralApi(
      new Request('https://ttr.gg/api/v1/workspaces/w?tag=1&tag=2', {
        method: 'PATCH',
        headers: { cookie: 'a=1', connection: 'keep-alive', host: 'ttr.gg' },
        body: '{"title":"exact"}',
      }),
      'https://central.example',
      { search: '?tag=1&tag=2', fetcher: fetcher as unknown as typeof fetch }
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
    expect(response.headers.get('location')).toBe('/elsewhere');
    expect(response.headers.get('transfer-encoding')).toBeNull();
    expect(await response.text()).toBe('{"denied":true}');
  });

  it('uses the normalized request search when no raw query is supplied', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://central.example/api/x?q=a%20b');
      expect(request.method).toBe('GET');
      return new Response(null, { status: 204 });
    });
    const response = await forwardToCentralApi(
      new Request('https://apps.tuturuuu.com/api/x?q=a%20b'),
      'https://central.example',
      { fetcher: fetcher as unknown as typeof fetch }
    );
    expect(response.status).toBe(204);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects unsafe or recursive central origins without fetching', async () => {
    const fetcher = vi.fn();
    for (const origin of [
      'https://ttr.gg',
      'https://user:pw@central.example',
      'https://central.example/prefix',
      'ftp://central.example',
    ]) {
      const response = await forwardToCentralApi(
        new Request('https://ttr.gg/api/v1/x'),
        origin,
        { search: '', fetcher: fetcher as unknown as typeof fetch }
      );
      expect(response.status).toBe(503);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('loop prevention by ownership', () => {
  it('allows a same-origin central API for paths the app does not own', async () => {
    const fetcher = vi.fn(
      async (request: Request) => new Response(request.url)
    );
    const mounted = await forwardToCentralApi(
      new Request('https://tuturuuu.com/api/v1/x'),
      'https://tuturuuu.com',
      {
        fetcher: fetcher as unknown as typeof fetch,
        ownsPath: (path) => path === '/meet' || path.startsWith('/meet/'),
      }
    );
    expect(await mounted.text()).toBe('https://tuturuuu.com/api/v1/x');
    const owned = await forwardToCentralApi(
      new Request('https://tuturuuu.com/meet/api/x'),
      'https://tuturuuu.com',
      {
        fetcher: fetcher as unknown as typeof fetch,
        ownsPath: (path) => path.startsWith('/meet/'),
      }
    );
    expect(owned.status).toBe(503);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe('request header allowlist', () => {
  const spoofed = {
    'x-forwarded-for': '192.0.2.99',
    'x-real-ip': '192.0.2.99',
    'true-client-ip': '192.0.2.99',
    'cf-connecting-ip': '192.0.2.99',
    forwarded: 'for=192.0.2.99',
    'x-client-ip': '192.0.2.99',
    'x-cluster-client-ip': '192.0.2.99',
    'x-vercel-forwarded-for': '192.0.2.99',
    'x-tuturuuu-origin-auth': `hmac-v1;1999999999;192.0.2.99;${'0'.repeat(64)}`,
    'x-forwarded-host': 'evil.test',
    'x-tuturuuu-app-base': '/evil',
    'x-vercel-protection-bypass': 'client-guess',
    'x-webhook-secret': 'client-guess',
  };
  const allowed = {
    accept: 'application/json',
    'accept-language': 'vi',
    'content-type': 'application/json',
    authorization: 'Bearer disposable-test-token',
    cookie: 'sb-auth=fixture; tuturuuu_app_session=fixture',
    origin: 'https://apps.tuturuuu.com',
    referer: 'https://apps.tuturuuu.com/ws',
    'user-agent': 'fixture-agent/1.0',
    'sec-fetch-site': 'same-origin',
    'idempotency-key': 'fixture-key',
    'x-tuturuuu-account-action': 'delete',
    'x-tuturuuu-turnstile-token': 'fixture-token',
  };

  async function forwardedRequest(options: ForwardOptions = {}) {
    let captured: Request | undefined;
    let body = '';
    const fetcher = vi.fn(async (request: Request) => {
      captured = request;
      body = await request.text();
      return new Response(null, { status: 204 });
    });
    await forwardToCentralApi(
      new Request('https://apps.tuturuuu.com/api/v1/x?y=1', {
        method: 'POST',
        headers: { ...spoofed, ...allowed },
        body: '{"exact":true}',
      }),
      'https://central.example',
      { fetcher: fetcher as unknown as typeof fetch, ...options }
    );
    if (!captured) throw new Error('not forwarded');
    return { request: captured, body };
  }

  it('drops client-IP assertions, the origin proof and unlisted headers', async () => {
    const { request } = await forwardedRequest();
    for (const name of Object.keys(spoofed))
      expect(request.headers.get(name)).toBeNull();
  });

  it('forwards allowlisted headers unchanged with method, body and query', async () => {
    const { request, body } = await forwardedRequest();
    for (const [name, value] of Object.entries(allowed))
      expect(request.headers.get(name)).toBe(value);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://central.example/api/v1/x?y=1');
    expect(body).toBe('{"exact":true}');
  });

  it('sets caller-produced values after the allowlist', async () => {
    const { request } = await forwardedRequest({
      setHeaders: { 'x-forwarded-host': 'mail.tuturuuu.com' },
    });
    expect(request.headers.get('x-forwarded-host')).toBe('mail.tuturuuu.com');
    expect(request.headers.get('x-forwarded-for')).toBeNull();
  });

  it('uses a caller-sanitized header set verbatim except hop-by-hop', async () => {
    const { request } = await forwardedRequest({
      callerSanitizedHeaders: new Headers({
        'next-action': 'action-id',
        'x-forwarded-for': '203.0.113.10',
        connection: 'keep-alive',
      }),
    });
    expect(request.headers.get('next-action')).toBe('action-id');
    expect(request.headers.get('x-forwarded-for')).toBe('203.0.113.10');
    expect(request.headers.get('connection')).toBeNull();
    expect(request.headers.get('cookie')).toBeNull();
  });

  it('streams a request body without buffering', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('part-1,'));
        controller.enqueue(encoder.encode('part-2'));
        controller.close();
      },
    });
    let body = '';
    await forwardToCentralApi(
      new Request('https://apps.tuturuuu.com/api/upload', {
        method: 'PUT',
        body: stream,
        duplex: 'half',
      } as RequestInit),
      'https://central.example',
      {
        fetcher: (async (request: Request) => {
          body = await request.text();
          return new Response(null, { status: 204 });
        }) as unknown as typeof fetch,
      }
    );
    expect(body).toBe('part-1,part-2');
  });
});
