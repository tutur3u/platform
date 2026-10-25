import { describe, expect, it, vi } from 'vitest';
import {
  after as afterResponse,
  connection,
  cookies,
  headers,
  type MeetRequestContext,
  meetRequest,
  withMeetRequest,
} from './request-context';

function fixture(cookie = '') {
  const pending: Promise<unknown>[] = [];
  const context = {
    request: new Request('https://meet.tuturuuu.com/plans/one', {
      headers: { cookie, 'x-actor': cookie },
    }),
    responseHeaders: new Headers(),
    waitUntil(work) {
      pending.push(work);
    },
  } satisfies MeetRequestContext;
  return { context, pending };
}

describe('Meet request lifecycle boundary', () => {
  it('fails closed outside a request without scheduling background work', async () => {
    const task = vi.fn();
    expect(() => meetRequest()).toThrow(
      'Start bridge request context unavailable'
    );
    await expect(headers()).rejects.toThrow(
      'Start bridge request context unavailable'
    );
    await expect(cookies()).rejects.toThrow(
      'Start bridge request context unavailable'
    );
    await expect(connection()).rejects.toThrow(
      'Start bridge request context unavailable'
    );
    expect(() => afterResponse(task)).toThrow(
      'Start bridge request context unavailable'
    );
    expect(task).not.toHaveBeenCalled();
  });

  it('supports cookie reads, both write/delete forms and immediate same-request visibility', async () => {
    const { context } = fixture('auth=old; preference=vi');
    await withMeetRequest(context, async () => {
      const store = await cookies();
      expect(store.size).toBe(2);
      expect(store.has('auth')).toBe(true);
      expect(
        store
          .getAll()
          .map(({ name }) => name)
          .sort()
      ).toEqual(['auth', 'preference']);
      expect([...store].map(([name]) => name).sort()).toEqual([
        'auth',
        'preference',
      ]);
      expect(store.toString()).toContain('preference=vi');
      store.set('auth', 'updated', { httpOnly: true, secure: true, path: '/' });
      expect(store.get('auth')?.value).toBe('updated');
      expect(
        context.responseHeaders
          .getSetCookie()
          .find((value) => value.startsWith('auth='))
      ).toContain('HttpOnly');
      store.set({ name: 'app', value: 'new', path: '/', httpOnly: true });
      expect(store.get('app')?.value).toBe('new');
      store.delete({ name: 'auth', path: '/' });
      expect(store.has('auth')).toBe(false);
      store.delete('app');
      expect(store.get('app')).toBeUndefined();
      expect(store.size).toBe(1);
      expect(store.get('preference')?.value).toBe('vi');
      expect(context.responseHeaders.getSetCookie()).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^auth=;.*Expires=Thu, 01 Jan 1970/),
          expect.stringMatching(/^app=;.*Expires=Thu, 01 Jan 1970/),
        ])
      );
    });
  });

  it('copies request headers and restores outer identity after a nested request', async () => {
    const outer = fixture('actor=outer');
    const inner = fixture('actor=inner');
    await withMeetRequest(outer.context, async () => {
      const copied = await headers();
      copied.set('x-actor', 'changed');
      expect((await headers()).get('x-actor')).toBe('actor=outer');
      await connection();
      await withMeetRequest(inner.context, async () => {
        expect((await cookies()).get('actor')?.value).toBe('inner');
        await Promise.resolve();
        expect(meetRequest().request).toBe(inner.context.request);
        expect(meetRequest().responseHeaders).toBe(
          inner.context.responseHeaders
        );
      });
      expect(meetRequest().request).toBe(outer.context.request);
      expect(meetRequest().responseHeaders).toBe(outer.context.responseHeaders);
      expect((await cookies()).get('actor')?.value).toBe('outer');
    });
    expect(() => meetRequest()).toThrow(
      'Start bridge request context unavailable'
    );
    expect(outer.context.responseHeaders.getSetCookie()).toEqual([]);
    expect(inner.context.responseHeaders.getSetCookie()).toEqual([]);
  });

  it('hands deferred callbacks and promises to the owning execution context', async () => {
    const { context, pending } = fixture();
    const callback = vi.fn(() => {
      expect(meetRequest().request).toBe(context.request);
      expect(meetRequest().responseHeaders).toBe(context.responseHeaders);
      return 'callback complete';
    });
    withMeetRequest(context, () => {
      afterResponse(callback);
      afterResponse(Promise.resolve('promise complete'));
    });
    expect(pending).toHaveLength(2);
    await expect(Promise.all(pending)).resolves.toEqual([
      'callback complete',
      'promise complete',
    ]);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(() => meetRequest()).toThrow(
      'Start bridge request context unavailable'
    );
  });

  it('retains a deferred failure for the execution context instead of reporting success', async () => {
    const { context, pending } = fixture();
    const failure = new Error('fixture deferred failure');
    withMeetRequest(context, () =>
      afterResponse(() => {
        throw failure;
      })
    );
    expect(pending).toHaveLength(1);
    await expect(pending[0]).rejects.toBe(failure);
  });
});
