import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeGoogleCalendarCode } from './google-oauth-code-exchange';

const input = {
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  code: 'fixture-code',
  codeVerifier: 'fixture-verifier',
  redirectUri: 'https://tuturuuu.com/calendar/api/v1/calendar/auth/callback',
};

const completeToken = {
  access_token: 'fixture-access',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/calendar',
};

describe('Google Calendar code exchange', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [401, { error: 'invalid_client' }, 'invalid_client'],
    [400, { error: 'redirect_uri_mismatch' }, 'redirect_uri_mismatch'],
    [400, { error: 'private-fixture-value' }, 'unrecognized_provider_error'],
    [200, { error: 'invalid_grant' }, 'invalid_grant'],
    [200, { expires_in: 3600 }, 'invalid_token_response'],
    [200, { ...completeToken, access_token: ' ' }, 'invalid_token_response'],
    [200, { ...completeToken, expires_in: 0 }, 'invalid_token_response'],
    [
      200,
      { ...completeToken, expires_in: undefined },
      'invalid_token_response',
    ],
    [200, { ...completeToken, token_type: 'Basic' }, 'invalid_token_response'],
    [
      200,
      { ...completeToken, token_type: undefined },
      'invalid_token_response',
    ],
    [200, { ...completeToken, scope: undefined }, 'calendar_scope_missing'],
    [
      200,
      { ...completeToken, error: 'private-fixture-value' },
      'unrecognized_provider_error',
    ],
  ])(
    'classifies HTTP %s using an allowlisted reason',
    async (status, body, code) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            { ...body, error_description: 'private-fixture-value' },
            { status }
          )
        );
      vi.stubGlobal('fetch', fetch);

      await expect(exchangeGoogleCalendarCode(input)).resolves.toEqual({
        ok: false,
        providerCode: code,
        status,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    [200, 'invalid_token_response'],
    [503, 'unrecognized_provider_error'],
  ])('rejects malformed JSON with upstream HTTP %s', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('{"private-fixture":', {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    await expect(exchangeGoogleCalendarCode(input)).resolves.toEqual({
      ok: false,
      providerCode: code,
      status,
    });
  });

  it('does not retry the one-use code after a transport failure', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('private-fixture-error'));
    vi.stubGlobal('fetch', fetch);

    await expect(exchangeGoogleCalendarCode(input)).resolves.toEqual({
      ok: false,
      providerCode: 'transport_error',
      status: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
