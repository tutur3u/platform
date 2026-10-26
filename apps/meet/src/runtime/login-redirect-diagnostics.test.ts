import { isRedirect } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoginRedirectProbe } from './login-redirect-diagnostics';
import { redirect } from './next-navigation';
import { withMeetRequest } from './request-context';

const response = (location?: string) =>
  new Response('SECRET_BODY', {
    status: 307,
    headers: location === undefined ? {} : { location },
  });
afterEach(() => vi.restoreAllMocks());

const base = 'https://meet.invalid/en/login?SECRET_REQUEST=one';
const context = (
  observeNavigation?: (href: string, result: unknown) => void
) => ({
  request: new Request(base),
  responseHeaders: new Headers(),
  waitUntil() {},
  observeNavigation,
});

describe('closed login redirect probe', () => {
  it('classifies exact paths, relative targets, central precedence and unexpected schemes', () => {
    for (const [href, origin, path] of [
      ['/', 'SAME', 'ROOT'],
      ['/login?SECRET_QUERY=two#SECRET_HASH', 'SAME', 'LOGIN'],
      ['/en/login', 'SAME', 'LOGIN'],
      ['/vi/login', 'SAME', 'LOGIN'],
      ['/verify-token', 'SAME', 'VERIFY_TOKEN'],
      ['/en/verify-token', 'SAME', 'VERIFY_TOKEN'],
      ['/vi/verify-token', 'SAME', 'VERIFY_TOKEN'],
      ['login', 'SAME', 'LOGIN'],
      ['/LOGIN', 'SAME', 'OTHER'],
      ['/login/', 'SAME', 'OTHER'],
      ['https://tuturuuu.com/login', 'CENTRAL', 'LOGIN'],
      ['https://tuturuuu.com.evil.invalid/login', 'OTHER', 'LOGIN'],
      ['http://tuturuuu.com/login', 'OTHER', 'LOGIN'],
      ['javascript:SECRET', 'OTHER', 'OTHER'],
      ['blob:https://tuturuuu.com/SECRET', 'OTHER', 'OTHER'],
    ]) {
      const probe = createLoginRedirectProbe(base);
      probe.observeNavigation(href!, response(href));
      const result = probe.seal(response(), 'returnedredirect');
      expect(result.navigationInput).toEqual({ origin, path });
      expect(result.navigationResponse).toEqual({ origin, path });
      expect(result.inspection).toBe('available');
      expect(JSON.stringify(result)).not.toMatch(/SECRET|https|invalid/);
    }
    const central = createLoginRedirectProbe('https://tuturuuu.com/login');
    central.observeNavigation('/login', response('/login'));
    expect(
      central.seal(response(), 'returnedother').navigationInput.origin
    ).toBe('CENTRAL');
  });

  it('starts missing, saturates multiple, clears ambiguous navigation cells and seals immutably', () => {
    const missing = { origin: 'MISSING', path: 'MISSING' };
    const empty = createLoginRedirectProbe(base).seal(
      response(),
      'returnedother'
    );
    expect(empty).toEqual({
      navigationCalls: 'none',
      navigationInput: missing,
      navigationResponse: missing,
      startResponse: missing,
      proxyResponse: missing,
      inspection: 'available',
    });
    const probe = createLoginRedirectProbe(base);
    for (let i = 0; i < 100; i++)
      probe.observeNavigation('/login', response('/login'));
    const headerReads = vi.spyOn(Response.prototype, 'headers', 'get');
    const snapshot = probe.seal(response('/'), 'returnedredirect');
    const readsAtSeal = headerReads.mock.calls.length;
    expect(snapshot.navigationCalls).toBe('multiple');
    expect(snapshot.navigationInput).toEqual({
      origin: 'UNKNOWN',
      path: 'UNKNOWN',
    });
    expect(snapshot.navigationResponse).toEqual(snapshot.navigationInput);
    probe.observeNavigation(
      'https://tuturuuu.com/login',
      response('/vi/verify-token')
    );
    probe.observeStart(response('/vi/verify-token'));
    expect(headerReads).toHaveBeenCalledTimes(readsAtSeal);
    expect(probe.seal(response('/vi/verify-token'), 'returnedredirect')).toBe(
      snapshot
    );
    expect(snapshot.startResponse).toEqual(missing);
    expect(snapshot.proxyResponse).toEqual({ origin: 'SAME', path: 'ROOT' });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.navigationInput)).toBe(true);
  });

  it('bounds all inspected strings and fails unavailable without coercion or options access', () => {
    for (const href of ['http://[', 'x'.repeat(8193)]) {
      const probe = createLoginRedirectProbe(base);
      probe.observeNavigation(href, response('/login'));
      const result = probe.seal(response(href), 'returnedredirect');
      expect(result.navigationInput).toEqual({
        origin: 'UNKNOWN',
        path: 'UNKNOWN',
      });
      expect(result.proxyResponse).toEqual(result.navigationInput);
      expect(result.inspection).toBe('unavailable');
    }
    for (const url of ['malformed', 'x'.repeat(8193)]) {
      const probe = createLoginRedirectProbe(url);
      probe.observeNavigation('/login', response('/login'));
      expect(probe.seal(response('/login'), 'returnedredirect')).toMatchObject({
        navigationInput: { origin: 'UNKNOWN', path: 'UNKNOWN' },
        inspection: 'unavailable',
      });
    }
    const bounded = createLoginRedirectProbe(base);
    bounded.observeNavigation(`/${'x'.repeat(8191)}`, response('/login'));
    expect(bounded.seal(response(), 'returnedother')).toMatchObject({
      navigationInput: { origin: 'SAME', path: 'OTHER' },
      inspection: 'available',
    });
    const getter = vi.fn(() => {
      throw Error('SECRET');
    });
    const lookalike = Object.defineProperties(
      {},
      {
        headers: { get: getter },
        options: { get: getter },
        toString: { get: getter },
      }
    );
    const probe = createLoginRedirectProbe(base);
    probe.observeNavigation('/login', lookalike);
    expect(probe.seal(lookalike, 'returnedother')).toMatchObject({
      navigationResponse: { origin: 'UNKNOWN', path: 'UNKNOWN' },
      inspection: 'unavailable',
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('uses native headers accessors and leaves response bodies and instance accessors untouched', () => {
    const getter = vi.fn(() => {
      throw Error('SECRET');
    });
    const original = response('https://tuturuuu.com/login?SECRET=token');
    for (const key of ['headers', 'options', 'body', 'bodyUsed', 'status'])
      Object.defineProperty(original, key, { get: getter });
    const probe = createLoginRedirectProbe(base);
    probe.observeNavigation('/login', original);
    probe.observeStart(original);
    const result = probe.seal(original, 'returnedredirect');
    expect(result.navigationResponse).toEqual({
      origin: 'CENTRAL',
      path: 'LOGIN',
    });
    expect(result.startResponse).toEqual(result.navigationResponse);
    expect(result.proxyResponse).toEqual(result.navigationResponse);
    expect(getter).not.toHaveBeenCalled();
    expect(Reflect.get(Response.prototype, 'bodyUsed', original)).toBe(false);
  });

  it('observes the actual navigation adapter and owning router response once, preserving thrown identity', () => {
    const probe = createLoginRedirectProbe(base);
    const seen: unknown[] = [];
    const observe = vi.fn((href: string, result: unknown) => {
      seen.push(result);
      probe.observeNavigation(href, result);
    });
    let thrown: unknown;
    try {
      withMeetRequest(context(observe), () =>
        redirect('https://tuturuuu.com/login?SECRET=token')
      );
    } catch (error) {
      thrown = error;
    }
    expect(observe).toHaveBeenCalledTimes(1);
    expect(thrown).toBe(seen[0]);
    expect(isRedirect(thrown)).toBe(true);
    expect(probe.seal(thrown, 'threw')).toMatchObject({
      navigationCalls: 'one',
      navigationInput: { origin: 'CENTRAL', path: 'LOGIN' },
      navigationResponse: { origin: 'CENTRAL', path: 'LOGIN' },
      proxyResponse: { origin: 'MISSING', path: 'MISSING' },
    });
  });

  it('a throwing diagnostic callback or absent request context cannot replace the real redirect', () => {
    let observed: unknown;
    const broken = vi.fn((_href: string, result: unknown) => {
      observed = result;
      throw Error('SECRET_HOOK');
    });
    let thrown: unknown;
    try {
      withMeetRequest(context(broken), () => redirect('/login'));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(observed);
    expect(isRedirect(thrown)).toBe(true);
    expect(broken).toHaveBeenCalledTimes(1);
    try {
      redirect('/login');
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
      return;
    }
    throw Error('Missing owning redirect');
  });
});
