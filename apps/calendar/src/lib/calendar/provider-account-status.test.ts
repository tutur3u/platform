import { describe, expect, it } from 'vitest';
import { inspectCalendarProviderAccountFailure } from './provider-account-status';

describe('Calendar provider account recovery', () => {
  it.each([
    [
      { response: { status: 400, data: { error: 'invalid_grant' } } },
      'reconnect_required',
    ],
    [{ response: { status: 401 } }, 'reconnect_required'],
    [{ response: { status: 401, data: '<html />' } }, 'reconnect_required'],
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
    [{ response: { status: 429 } }, 'temporarily_unavailable'],
    [
      {
        response: {
          status: 403,
          data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
        },
      },
      'temporarily_unavailable',
    ],
    [new TypeError('fetch failed'), 'temporarily_unavailable'],
  ])('classifies %j as %s', (error, expected) => {
    expect(inspectCalendarProviderAccountFailure('google', error).state).toBe(
      expected
    );
  });

  it.each([
    [{ name: 'TimeoutError' }, 'timeout'],
    [{ name: 'TypeError', cause: { code: 'ENOTFOUND' } }, 'dns'],
    [{ cause: { code: 'CERT_HAS_EXPIRED' } }, 'tls'],
    [{ name: 'AbortError', message: 'request interrupted' }, 'abort'],
  ])('reports an allowlisted transport category for %j', (error, category) => {
    expect(
      inspectCalendarProviderAccountFailure('google', error)
    ).toMatchObject({
      state: 'temporarily_unavailable',
      transportCategory: category,
    });
  });

  it('does not forward arbitrary names or codes from upstream', () => {
    expect(
      inspectCalendarProviderAccountFailure('google', {
        name: 'private-provider-name',
        code: 'private-provider-code',
        response: {
          status: 403,
          data: { error: { errors: [{ reason: 'private-reason' }] } },
        },
      })
    ).toEqual({
      state: 'status_unknown',
      upstreamStatus: 403,
      googleErrorCode: null,
      errorName: null,
      transportCategory: null,
    });
  });
});
