// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  appendContextCookies,
  cookies,
  headers,
  withRequestContext,
} from './request-context';

describe('Apps concurrent request cookies', () => {
  it('isolates interleaved actors and appends all response cookies without replaying body', async () => {
    const work = (actor: string) =>
      withRequestContext(
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
            result.headers
              .getSetCookie()
              .every((cookie) => cookie.includes(actor))
          ).toBe(true);
          expect(await result.text()).toBe('stream');
        }
      );
    await Promise.all([work('alpha'), work('beta')]);
  });
  it('deletes the incoming cookie immediately, returns the same store and expires only that outgoing cookie', async () => {
    await withRequestContext(
      new Request('https://apps.tuturuuu.com', {
        headers: { cookie: 'session=old-session; preference=compact' },
      }),
      async () => {
        const store = await cookies();
        store.set('theme', 'dark', { path: '/', secure: true });
        expect(store.has('session')).toBe(true);
        expect(store.delete('session')).toBe(store);
        expect(store.has('session')).toBe(false);
        expect(store.get('session')).toBeUndefined();
        expect(store.getAll().map((cookie) => cookie.name)).not.toContain(
          'session'
        );
        const again = await cookies();
        expect(again.has('session')).toBe(false);
        expect(again.get('session')).toBeUndefined();
        expect(again.get('preference')?.value).toBe('compact');
        expect(again.get('theme')?.value).toBe('dark');
        const response = appendContextCookies(
          new Response('unchanged', {
            headers: { 'Set-Cookie': 'upstream=kept; Path=/; HttpOnly' },
          })
        );
        const outgoing = response.headers.getSetCookie();
        expect(outgoing).toHaveLength(3);
        expect(outgoing).toContain('upstream=kept; Path=/; HttpOnly');
        expect(outgoing).toContain('theme=dark; Path=/; Secure');
        const expired = outgoing.find((cookie) =>
          cookie.startsWith('session=')
        );
        expect(expired?.split(';')[0]).toBe('session=');
        expect(expired).toContain('Path=/');
        expect(expired).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        expect(
          outgoing.some((cookie) => cookie.startsWith('preference='))
        ).toBe(false);
        expect(await response.text()).toBe('unchanged');
      }
    );
  });
  it('fails outside the owning request', async () => {
    await expect(headers()).rejects.toThrow('Start bridge request context unavailable');
  });
});
