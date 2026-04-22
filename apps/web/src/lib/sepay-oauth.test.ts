import { describe, expect, it } from 'vitest';
import {
  buildSepayOauthAuthorizeUrl,
  createSepayOauthState,
  getSepayOauthStateCookieName,
  verifySepayOauthState,
} from './sepay-oauth';

describe('sepay oauth helpers', () => {
  it('creates and verifies an opaque oauth state token', () => {
    const { state } = createSepayOauthState();

    const verification = verifySepayOauthState({
      expectedState: state,
      state,
    });

    expect(verification).toEqual({ ok: true });
  });

  it('rejects mismatched oauth state tokens', () => {
    const { state } = createSepayOauthState();

    const verification = verifySepayOauthState({
      expectedState: state,
      state: 'tampered',
    });

    expect(verification).toEqual({ ok: false });
  });

  it('creates a workspace-scoped cookie name for oauth state', () => {
    expect(
      getSepayOauthStateCookieName('11111111-1111-1111-1111-111111111111')
    ).toMatch(/^sepay_oauth_state_/u);
  });

  it('builds authorize url with required query params', () => {
    const url = buildSepayOauthAuthorizeUrl({
      authorizeUrl: 'https://example.com/oauth/authorize',
      clientId: 'client-123',
      redirectUri: 'https://app.example.com/callback',
      scope: 'accounts.read transactions.read',
      state: 'opaque-state',
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe('client-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/callback'
    );
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('state')).toBe('opaque-state');
    expect(parsed.searchParams.get('scope')).toBe(
      'accounts.read transactions.read'
    );
  });
});
