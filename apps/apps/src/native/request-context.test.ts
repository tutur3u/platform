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
  it('fails outside the owning request', async () => {
    await expect(headers()).rejects.toThrow('Apps request context unavailable');
  });
});
