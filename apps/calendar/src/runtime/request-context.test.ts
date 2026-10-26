import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { describe, expect, it, vi } from 'vitest';
import {
  after,
  type CalendarRequestContext,
  calendarRequest,
  connection,
  cookies,
  headers,
  withCalendarRequest,
} from './request-context';

function context(cookie = 'app=one; refresh=two'): CalendarRequestContext {
  return {
    request: new Request('https://calendar.test/personal', {
      headers: { cookie, 'x-request': 'original' },
    }),
    responseHeaders: new Headers(),
    waitUntil: vi.fn(),
  };
}

describe('real Calendar request context', () => {
  it('fails closed outside a request and restores nested async contexts', async () => {
    expect(calendarRequest).toThrow('Calendar request context is unavailable');
    await expect(connection()).rejects.toThrow(
      'Start bridge request context unavailable'
    );
    await expect(headers()).rejects.toThrow(
      'Start bridge request context unavailable'
    );
    await expect(cookies()).rejects.toThrow(
      'Start bridge request context unavailable'
    );
    expect(() => after(() => undefined)).toThrow(
      'Start bridge request context unavailable'
    );
    const outer = context();
    const inner = context('app=inner');
    await withCalendarRequest(outer, async () => {
      await connection();
      expect(calendarRequest()).toBe(outer);
      await withCalendarRequest(inner, async () => {
        await Promise.resolve();
        expect(calendarRequest()).toBe(inner);
        expect((await cookies()).get('app')?.value).toBe('inner');
      });
      expect(calendarRequest()).toBe(outer);
      expect((await cookies()).get('app')?.value).toBe('one');
    });
    expect(calendarRequest).toThrow('context is unavailable');
  });

  it('isolates overlapping async requests and returns independent header copies', async () => {
    const first = context('app=first');
    const second = context('app=second');
    await Promise.all(
      [first, second].map((current) =>
        withCalendarRequest(current, async () => {
          await Promise.resolve();
          const copy = await headers();
          copy.set('x-request', 'changed');
          copy.delete('cookie');
          expect(calendarRequest()).toBe(current);
          expect((await headers()).get('x-request')).toBe('original');
          expect((await headers()).get('cookie')).toBe(
            current.request.headers.get('cookie')
          );
          expect((await cookies()).get('app')?.value).toBe(
            current === first ? 'first' : 'second'
          );
        })
      )
    );
  });

  it('reads both set forms immediately and preserves expired cookie attributes', async () => {
    const current = context();
    await withCalendarRequest(current, async () => {
      const jar = await cookies();
      expect(jar.size).toBe(2);
      expect(jar.has('app')).toBe(true);
      expect(jar.getAll()).toEqual([
        { name: 'app', value: 'one' },
        { name: 'refresh', value: 'two' },
      ]);
      expect([...jar]).toEqual([
        ['app', { name: 'app', value: 'one' }],
        ['refresh', { name: 'refresh', value: 'two' }],
      ]);
      expect(jar.toString()).toBe('app=one; refresh=two');
      jar.set('app', 'rotated', { path: '/', httpOnly: true, secure: true });
      expect(jar.get('app')).toEqual({ name: 'app', value: 'rotated' });
      const expires = new Date('2000-01-01T00:00:00.000Z');
      jar.set({
        name: 'expired',
        value: 'retained',
        expires,
        path: '/personal',
        domain: 'calendar.test',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
      expect(jar.get('expired')).toEqual({
        name: 'expired',
        value: 'retained',
      });
      expect(jar.size).toBe(3);
      const outgoing = new ResponseCookies(current.responseHeaders);
      expect(outgoing.get('app')).toMatchObject({
        value: 'rotated',
        path: '/',
        httpOnly: true,
        secure: true,
      });
      expect(outgoing.get('expired')).toEqual({
        name: 'expired',
        value: 'retained',
        expires,
        path: '/personal',
        domain: 'calendar.test',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
      expect((await cookies()).get('app')?.value).toBe('rotated');
      expect((await cookies()).get('expired')?.value).toBe('retained');
    });
  });

  it('deletes by name and options from immediate reads and emits scoped expirations', async () => {
    const current = context();
    await withCalendarRequest(current, async () => {
      const jar = await cookies();
      jar.delete('app');
      jar.delete({
        name: 'refresh',
        path: '/personal',
        domain: 'calendar.test',
      });
      expect(jar.has('app')).toBe(false);
      expect(jar.get('refresh')).toBeUndefined();
      expect(jar.getAll()).toEqual([]);
      expect([...jar]).toEqual([]);
      expect(jar.size).toBe(0);
      expect(jar.toString()).toBe('');
      expect(current.responseHeaders.getSetCookie()).toEqual([
        expect.stringMatching(/^app=;/),
        expect.stringMatching(/^refresh=;/),
      ]);
      const outgoing = new ResponseCookies(current.responseHeaders);
      expect(outgoing.get('app')).toMatchObject({
        name: 'app',
        expires: new Date(0),
        path: '/',
      });
      expect(outgoing.get('refresh')).toMatchObject({
        name: 'refresh',
        expires: new Date(0),
        path: '/personal',
        domain: 'calendar.test',
      });
    });
  });

  it('defers callbacks, retains their ALS identity, and passes rejection to waitUntil', async () => {
    const current = context();
    const work: Promise<unknown>[] = [];
    current.waitUntil = (promise) => work.push(promise);
    const failure = new Error('deferred callback failed');
    const callback = vi.fn(() => {
      expect(calendarRequest()).toBe(current);
      throw failure;
    });
    withCalendarRequest(current, () => {
      after(callback);
      expect(callback).not.toHaveBeenCalled();
      expect(work).toHaveLength(1);
    });
    await expect(work[0]).rejects.toBe(failure);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(calendarRequest).toThrow('context is unavailable');
  });

  it('retains context across an asynchronous callback and forwards its result', async () => {
    const current = context();
    const work: Promise<unknown>[] = [];
    current.waitUntil = (promise) => work.push(promise);
    const result = { completed: true };
    withCalendarRequest(current, () =>
      after(async () => {
        await Promise.resolve();
        expect(calendarRequest()).toBe(current);
        expect((await cookies()).get('app')?.value).toBe('one');
        return result;
      })
    );
    expect(work).toHaveLength(1);
    await expect(work[0]).resolves.toBe(result);
    expect(calendarRequest).toThrow('context is unavailable');
  });

  it('adopts a supplied promise without replacing its rejection reason', async () => {
    const current = context();
    const work: Promise<unknown>[] = [];
    current.waitUntil = (promise) => work.push(promise);
    let rejectWork: (reason: unknown) => void = () => {
      throw new Error('promise executor did not run');
    };
    const supplied = new Promise<unknown>((_resolve, reject) => {
      rejectWork = reject;
    });
    withCalendarRequest(current, () => after(supplied));
    expect(work).toHaveLength(1);
    // Let after adopt the input before rejecting it, avoiding an unhandled input.
    await Promise.resolve();
    const failure = new Error('supplied promise failed');
    const observed = expect(work[0]).rejects.toBe(failure);
    rejectWork(failure);
    await observed;
  });
});
