import { describe, expect, it, vi } from 'vitest';
import {
  after as afterResponse,
  appendContextCookies,
  bridgeRequest,
  connection,
  cookies,
  createRequestLocal,
  headers,
  maybeBridgeRequest,
  withBridgeRequest,
} from './request-context';

describe('bridge request context', () => {
  it('isolates interleaved requests and appends all cookies without replaying the body', async () => {
    const work = (actor: string) =>
      withBridgeRequest(
        new Request('https://apps.tuturuuu.com', {
          headers: { cookie: `actor=${actor}` },
        }),
        async () => {
          await Promise.resolve();
          const store = await cookies();
          store.set('first', actor, { path: '/', httpOnly: true });
          store.set('second', actor, { path: '/', secure: true });
          expect((await headers()).get('cookie')).toBe(`actor=${actor}`);
          expect(store.get('actor')?.value).toBe(actor);
          expect((await cookies()).get('first')?.value).toBe(actor);
          const result = appendContextCookies(
            new Response('stream', {
              headers: { 'Set-Cookie': `upstream=${actor}; Path=/` },
            })
          );
          expect(result.headers.getSetCookie()).toHaveLength(3);
          expect(
            result.headers.getSetCookie().every((c) => c.includes(actor))
          ).toBe(true);
          expect(await result.text()).toBe('stream');
        }
      );
    await Promise.all([work('alpha'), work('beta')]);
  });

  it('deletes the incoming cookie immediately and expires only that outgoing cookie', async () => {
    await withBridgeRequest(
      new Request('https://apps.tuturuuu.com', {
        headers: { cookie: 'session=old-session; preference=compact' },
      }),
      async () => {
        const store = await cookies();
        store.set('theme', 'dark', { path: '/', secure: true });
        expect(store.delete('session')).toBe(store);
        expect(store.has('session')).toBe(false);
        const again = await cookies();
        expect(again.get('session')).toBeUndefined();
        expect(again.get('preference')?.value).toBe('compact');
        expect(again.get('theme')?.value).toBe('dark');
        const outgoing = appendContextCookies(
          new Response('unchanged', {
            headers: { 'Set-Cookie': 'upstream=kept; Path=/; HttpOnly' },
          })
        ).headers.getSetCookie();
        expect(outgoing).toHaveLength(3);
        expect(outgoing).toContain('theme=dark; Path=/; Secure');
        const expired = outgoing.find((c) => c.startsWith('session='));
        expect(expired).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        expect(outgoing.some((c) => c.startsWith('preference='))).toBe(false);
      }
    );
  });

  it('does not mutate an immutable incoming request but writes through a supplied cookie source', async () => {
    const request = new Request('https://meet.tuturuuu.com', {
      headers: { cookie: 'a=1' },
    });
    await withBridgeRequest(request, async () => {
      (await cookies()).set('b', '2');
    });
    expect(request.headers.get('cookie')).toBe('a=1');
    const source = new Headers({ cookie: 'a=1' });
    await withBridgeRequest({ request, cookieSource: source }, async () => {
      (await cookies()).set('b', '2');
    });
    expect(source.get('cookie')).toBe('a=1; b=2');
  });

  it('carries typed locals, cloudflare bindings and waitUntil', async () => {
    const page = createRequestLocal<{ kind: string }>('page');
    expect(page.get()).toBeUndefined();
    const waitUntil = vi.fn();
    await withBridgeRequest(
      {
        request: new Request('https://x.test'),
        waitUntil,
        cloudflare: { env: { A: 1 }, ctx: {} },
      },
      async () => {
        page.set({ kind: 'password' });
        expect(page.get()).toEqual({ kind: 'password' });
        expect(bridgeRequest().cloudflare?.env).toEqual({ A: 1 });
        await connection();
        let ran = false;
        afterResponse(() => {
          ran = true;
        });
        expect(waitUntil).toHaveBeenCalledOnce();
        await waitUntil.mock.calls[0]?.[0];
        expect(ran).toBe(true);
      }
    );
    expect(page.get()).toBeUndefined();
  });

  it('fails closed outside a request and without waitUntil', async () => {
    expect(maybeBridgeRequest()).toBeUndefined();
    await expect(headers()).rejects.toThrow(
      'Start bridge request context unavailable'
    );
    await expect(connection()).rejects.toThrow('unavailable');
    expect(() => appendContextCookies(new Response())).toThrow('unavailable');
    withBridgeRequest(new Request('https://x.test'), () => {
      expect(() => afterResponse(() => {})).toThrow('requires a waitUntil');
    });
  });
});
