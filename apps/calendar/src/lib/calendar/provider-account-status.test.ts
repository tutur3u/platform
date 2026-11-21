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
      new Error('invalid_grant: Token has been expired or revoked.'),
      'reconnect_required',
    ],
    [new Error('No refresh token is set.'), 'reconnect_required'],
    [
      new Error('fetch failed', {
        cause: { response: { status: 400, data: { error: 'invalid_grant' } } },
      }),
      'reconnect_required',
    ],
    [new TypeError('Unsupported transport'), 'status_unknown'],
    [
      {
        response: { status: '401' },
        cause: { response: { status: 401, data: { error: 'invalid_client' } } },
      },
      'configuration',
    ],
    [
      { response: { status: 401, data: { error: 'invalid_client' } } },
      'configuration',
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
    [{ response: { status: 404 } }, 'status_unknown'],
    [{ response: { status: 503 } }, 'temporarily_unavailable'],
    [new TypeError('fetch failed'), 'temporarily_unavailable'],
  ])('classifies %j as %s', (error, expected) => {
    expect(classifyCalendarProviderAccountStatus('google', error)).toBe(
      expected
    );
  });
});
