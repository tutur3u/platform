import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSepayOauthAuthorizeUrl,
  createSepayOauthState,
  getSepayOauthStateCookieName,
  verifySepayOauthState,
} from './sepay-oauth';

describe('sepay oauth helpers', () => {
  const originalClientSecret = process.env.SEPAY_OAUTH_CLIENT_SECRET;
  const originalStateSecret = process.env.SEPAY_OAUTH_STATE_SECRET;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T01:00:00.000Z'));
    process.env.SEPAY_OAUTH_CLIENT_SECRET = 'client-secret-for-state';
    delete process.env.SEPAY_OAUTH_STATE_SECRET;
  });

  afterEach(() => {
    if (originalClientSecret == null) {
      delete process.env.SEPAY_OAUTH_CLIENT_SECRET;
    } else {
      process.env.SEPAY_OAUTH_CLIENT_SECRET = originalClientSecret;
    }

    if (originalStateSecret == null) {
      delete process.env.SEPAY_OAUTH_STATE_SECRET;
    } else {
      process.env.SEPAY_OAUTH_STATE_SECRET = originalStateSecret;
    }

    vi.useRealTimers();
  });

  it('creates and verifies a signed workspace-bound oauth state token', () => {
    const { state } = createSepayOauthState({ wsId: 'ws_1' });

    const verification = verifySepayOauthState({
      expectedState: state,
      state,
      wsId: 'ws_1',
    });

    expect(verification).toEqual({ ok: true });
    expect(state.split('.')).toHaveLength(2);
  });

  it('rejects mismatched oauth state tokens', () => {
    const { state } = createSepayOauthState({ wsId: 'ws_1' });

    const verification = verifySepayOauthState({
      expectedState: state,
      state: 'tampered',
      wsId: 'ws_1',
    });

    expect(verification).toEqual({ ok: false });
  });

  it('rejects unsigned fixed oauth state values even when cookie and query match', () => {
    const verification = verifySepayOauthState({
      expectedState: 'attacker-chosen-state',
      state: 'attacker-chosen-state',
      wsId: 'ws_1',
    });

    expect(verification).toEqual({ ok: false });
  });

  it('rejects signed oauth state for another workspace', () => {
    const { state } = createSepayOauthState({ wsId: 'ws_1' });

    const verification = verifySepayOauthState({
      expectedState: state,
      state,
      wsId: 'ws_2',
    });

    expect(verification).toEqual({ ok: false });
  });

  it('rejects expired signed oauth state', () => {
    const { state } = createSepayOauthState({ ttlMs: 1000, wsId: 'ws_1' });

    vi.advanceTimersByTime(1001);

    const verification = verifySepayOauthState({
      expectedState: state,
      state,
      wsId: 'ws_1',
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
