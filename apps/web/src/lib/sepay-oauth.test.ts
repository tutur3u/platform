import { describe, expect, it } from 'vitest';
import {
  buildSepayOauthAuthorizeUrl,
  createSepayOauthState,
  verifySepayOauthState,
} from './sepay-oauth';

describe('sepay oauth helpers', () => {
  it('creates and verifies a signed oauth state', () => {
    const { state } = createSepayOauthState({
      secret: 'state-secret',
      wsId: '11111111-1111-1111-1111-111111111111',
    });

    const verification = verifySepayOauthState({
      secret: 'state-secret',
      state,
    });

    expect(verification).toMatchObject({
      ok: true,
      wsId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('rejects tampered oauth state signatures', () => {
    const { state } = createSepayOauthState({
      secret: 'state-secret',
      wsId: '11111111-1111-1111-1111-111111111111',
    });

    const [payload] = state.split('.');
    const tamperedState = `${payload}.tampered`;

    const verification = verifySepayOauthState({
      secret: 'state-secret',
      state: tamperedState,
    });

    expect(verification).toEqual({ ok: false });
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
