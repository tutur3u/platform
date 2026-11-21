import { describe, expect, it } from 'vitest';
import { classifyCalendarProviderAccountStatus } from './provider-account-status';

describe('Calendar provider account recovery', () => {
  it.each([
    [
      { response: { status: 400, data: { error: 'invalid_grant' } } },
      'reconnect_required',
    ],
    [{ response: { status: 401 } }, 'reconnect_required'],
    [
      { response: { status: 401, data: { error: 'invalid_client' } } },
      'temporarily_unavailable',
    ],
    [
      {
        response: {
          status: 403,
          data: {
            error: { details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] },
          },
        },
      },
      'scope_required',
    ],
    [
      { response: { status: 400, data: { error: 'invalid_scope' } } },
      'scope_required',
    ],
    [{ response: { status: 410 } }, 'removed'],
    [{ response: { status: 404 } }, 'temporarily_unavailable'],
    [{ response: { status: 503 } }, 'temporarily_unavailable'],
    [new TypeError('fetch failed'), 'temporarily_unavailable'],
  ])('classifies %j as %s', (error, expected) => {
    expect(classifyCalendarProviderAccountStatus('google', error)).toBe(
      expected
    );
  });
});
