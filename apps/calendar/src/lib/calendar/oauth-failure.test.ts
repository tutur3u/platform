import { describe, expect, it } from 'vitest';
import { classifyCalendarOAuthFailure } from './oauth-failure';

const gaxios = (status: number, error?: string, description?: string) =>
  Object.assign(new Error(error ?? `Request failed with status ${status}`), {
    response: {
      status,
      data: error ? { error, error_description: description } : undefined,
    },
  });
const msal = (
  errorCode: string,
  errorNo?: string,
  extra: Record<string, unknown> = {}
) => ({
  name: 'ServerError',
  errorCode,
  errorNo,
  errorMessage: `AADSTS${errorNo ?? '0'}: details with user@example.com`,
  message: `${errorCode}: AADSTS${errorNo ?? '0'}: details`,
  status: 400,
  ...extra,
});

describe('Google refresh failures', () => {
  it.each([
    [
      gaxios(400, 'invalid_grant', 'Token has been expired or revoked.'),
      'google_invalid_grant',
    ],
    [new Error('invalid_grant'), 'google_invalid_grant'],
    [
      gaxios(400, 'invalid_grant', 'Account has been deleted'),
      'google_access_revoked',
    ],
    [gaxios(400, 'access_denied'), 'google_access_revoked'],
    [gaxios(400, 'brand_new_code'), 'unknown_permanent'],
  ])('quarantines %o as %s', (error, reason) => {
    expect(classifyCalendarOAuthFailure('google', error)).toMatchObject({
      kind: 'permanent',
      reason,
    });
  });

  it.each([
    gaxios(500),
    gaxios(503, 'server_error'),
    gaxios(429),
    gaxios(400, 'temporarily_unavailable'),
    Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    Object.assign(new Error('getaddrinfo'), { code: 'EAI_AGAIN' }),
    new DOMException('Calendar sync timed out', 'TimeoutError'),
    new TypeError('fetch failed'),
  ])('never quarantines transient %o', (error) => {
    expect(classifyCalendarOAuthFailure('google', error)?.kind).toBe(
      'transient'
    );
  });

  it.each([
    gaxios(401, 'invalid_client'),
    gaxios(400, 'invalid_request'),
    gaxios(401, 'unauthorized_client'),
    gaxios(400, 'invalid_scope'),
  ])('treats our own client configuration %o as systemic', (error) => {
    expect(classifyCalendarOAuthFailure('google', error)?.kind).toBe(
      'systemic'
    );
  });

  it('ignores errors that are not credential failures', () => {
    expect(
      classifyCalendarOAuthFailure('google', gaxios(404, undefined))
    ).toBeNull();
    expect(
      classifyCalendarOAuthFailure(
        'google',
        new Error('Sync token is no longer valid')
      )
    ).toBeNull();
  });
});

describe('Microsoft refresh failures', () => {
  it.each([
    [msal('invalid_grant', '70008'), 'microsoft_invalid_grant'],
    [msal('invalid_grant', '50173'), 'microsoft_invalid_grant'],
    [msal('interaction_required', '50076'), 'microsoft_invalid_grant'],
    [msal('invalid_grant', '65001'), 'microsoft_consent_revoked'],
    [
      msal('invalid_grant', undefined, { subError: 'consent_required' }),
      'microsoft_consent_revoked',
    ],
  ])('quarantines %o as %s', (error, reason) => {
    expect(classifyCalendarOAuthFailure('microsoft', error)).toMatchObject({
      kind: 'permanent',
      reason,
    });
  });

  it('keeps throttling, outages and network errors transient', () => {
    for (const error of [
      msal('invalid_grant', '50196'),
      msal('temporarily_unavailable', '0', { status: 503 }),
      {
        name: 'ClientAuthError',
        errorCode: 'network_error',
        message: 'network_error',
      },
    ])
      expect(classifyCalendarOAuthFailure('microsoft', error)?.kind).toBe(
        'transient'
      );
  });

  it.each([
    msal('invalid_client', '7000222'),
    msal('invalid_client', '7000215'),
    msal('invalid_grant', '700016'),
    msal('unauthorized_client', '700016'),
    msal('invalid_grant', '700027'),
    msal('invalid_grant', '50012'),
    msal('invalid_grant', '7000112'),
    msal('invalid_scope', '70011'),
  ])('treats application-level failure %o as systemic', (error) => {
    expect(classifyCalendarOAuthFailure('microsoft', error)).toMatchObject({
      kind: 'systemic',
    });
  });

  it('logs only machine-readable provider codes', () => {
    const failure = classifyCalendarOAuthFailure(
      'microsoft',
      msal('invalid_grant', '70008')
    );
    expect(failure?.providerCode).toBe('invalid_grant/AADSTS70008/http_400');
    expect(JSON.stringify(failure)).not.toContain('example.com');
  });
});
