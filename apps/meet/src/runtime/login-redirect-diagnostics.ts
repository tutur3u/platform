import { z } from 'zod';

const targetSchema = z
  .object({
    origin: z.enum(['SAME', 'CENTRAL', 'OTHER', 'MISSING', 'UNKNOWN']),
    path: z.enum([
      'ROOT',
      'LOGIN',
      'VERIFY_TOKEN',
      'OTHER',
      'MISSING',
      'UNKNOWN',
    ]),
  })
  .strict();
export const loginRedirectSchema = z
  .object({
    navigationCalls: z.enum(['none', 'one', 'multiple']),
    navigationInput: targetSchema,
    navigationResponse: targetSchema,
    startResponse: targetSchema,
    proxyResponse: targetSchema,
    inspection: z.enum(['available', 'unavailable']),
  })
  .strict();
export type LoginRedirectProjection = z.infer<typeof loginRedirectSchema>;
type Target = z.infer<typeof targetSchema>;
export type ObserveLoginNavigation = (href: string, response: unknown) => void;
const missing = (): Target => ({ origin: 'MISSING', path: 'MISSING' });
const unknown = (): Target => ({ origin: 'UNKNOWN', path: 'UNKNOWN' });
const limit = 8192;

export function createLoginRedirectProbe(requestUrl: string) {
  let base: URL | undefined;
  let sealed = false;
  let snapshot: LoginRedirectProjection | undefined;
  let navigationCalls: LoginRedirectProjection['navigationCalls'] = 'none';
  let navigationInput = missing();
  let navigationResponse = missing();
  let startResponse = missing();
  let inspection: LoginRedirectProjection['inspection'] = 'available';
  try {
    if (typeof requestUrl !== 'string' || requestUrl.length > limit)
      throw Error();
    base = new URL(requestUrl);
    base.search = '';
    base.hash = '';
  } catch {
    inspection = 'unavailable';
  }

  function target(value: unknown): Target {
    if (value === null) return missing();
    try {
      if (!base || typeof value !== 'string' || value.length > limit)
        throw Error();
      const url = new URL(value, base);
      return {
        origin: !['http:', 'https:'].includes(url.protocol)
          ? 'OTHER'
          : url.origin === 'https://tuturuuu.com'
            ? 'CENTRAL'
            : url.origin === base.origin
              ? 'SAME'
              : 'OTHER',
        path:
          url.pathname === '/'
            ? 'ROOT'
            : ['/login', '/en/login', '/vi/login'].includes(url.pathname)
              ? 'LOGIN'
              : [
                    '/verify-token',
                    '/en/verify-token',
                    '/vi/verify-token',
                  ].includes(url.pathname)
                ? 'VERIFY_TOKEN'
                : 'OTHER',
      };
    } catch {
      inspection = 'unavailable';
      return unknown();
    }
  }

  function responseTarget(response: unknown): Target {
    try {
      // Native accessors bypass ordinary instance getters and never read options or bodies.
      // This is not a defense against hostile proxies or modified global intrinsics.
      const getHeaders = Object.getOwnPropertyDescriptor(
        Response.prototype,
        'headers'
      )?.get;
      if (!getHeaders) throw Error();
      const headers: unknown = getHeaders.call(response);
      return target(Headers.prototype.get.call(headers, 'location'));
    } catch {
      inspection = 'unavailable';
      return unknown();
    }
  }

  const observeNavigation: ObserveLoginNavigation = (href, response) => {
    if (sealed) return;
    if (navigationCalls !== 'none') {
      navigationCalls = 'multiple';
      navigationInput = unknown();
      navigationResponse = unknown();
      return;
    }
    navigationCalls = 'one';
    navigationInput = target(href);
    navigationResponse = responseTarget(response);
  };

  return {
    observeNavigation,
    observeStart(response: unknown) {
      if (!sealed) startResponse = responseTarget(response);
    },
    seal(value: unknown, outcome: string): LoginRedirectProjection {
      if (snapshot) return snapshot;
      sealed = true;
      const proxyResponse =
        outcome === 'threw' ? missing() : responseTarget(value);
      base = undefined;
      snapshot = Object.freeze({
        navigationCalls,
        navigationInput: Object.freeze(navigationInput),
        navigationResponse: Object.freeze(navigationResponse),
        startResponse: Object.freeze(startResponse),
        proxyResponse: Object.freeze(proxyResponse),
        inspection,
      });
      return snapshot;
    },
  };
}
