import { InternalApiError } from '@tuturuuu/internal-api';
import { expect, it } from 'vitest';
import { retryStartup, startupErrorKey } from './startup-error';

it('separates sign-in, blocked requests and missing meetings from outages', () => {
  expect(startupErrorKey(new InternalApiError('', 401))).toBe(
    'startup_sign_in'
  );
  expect(startupErrorKey(new InternalApiError('', 403))).toBe(
    'startup_blocked'
  );
  expect(startupErrorKey(new InternalApiError('', 404))).toBe(
    'startup_missing'
  );
  expect(startupErrorKey(new InternalApiError('', 503))).toBe(
    'startup_unavailable'
  );
});
it('retries temporary failures but never repeats a device switch or access denial', () => {
  expect(retryStartup(0, new TypeError('Failed to fetch'), false)).toBe(true);
  expect(retryStartup(1, new InternalApiError('', 503), false)).toBe(true);
  expect(retryStartup(2, new InternalApiError('', 503), false)).toBe(false);
  expect(retryStartup(0, new InternalApiError('', 403), false)).toBe(false);
  expect(retryStartup(0, new InternalApiError('', 503), true)).toBe(false);
});
