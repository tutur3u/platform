import { describe, expect, it } from 'vitest';
import { resolveTurnstilePillState } from './turnstile-pill-state';
import { resolveLoginTurnstileClientState } from './turnstile-state';

const production = (siteKey?: string) =>
  resolveLoginTurnstileClientState({
    devMode: false,
    localE2EAuthBypass: false,
    siteKey,
    supabaseUrl: 'https://project.supabase.co',
  });

describe('resolveTurnstilePillState', () => {
  it('shows no pill when the login does not require a check', () => {
    const state = resolveLoginTurnstileClientState({
      devMode: true,
      localE2EAuthBypass: false,
      siteKey: 'fixture-site-key',
      supabaseUrl: 'http://127.0.0.1:54321',
    });
    expect(state.isRequired).toBe(false);
    expect(resolveTurnstilePillState(state)).toBeNull();
  });

  it('reports a required check without a site key as unavailable', () => {
    const state = production(undefined);
    expect(state).toMatchObject({ canRenderWidget: false, isRequired: true });
    expect(resolveTurnstilePillState(state)).toBe('unavailable');
    // An error or a stale token never hides a missing configuration.
    expect(
      resolveTurnstilePillState({ ...state, error: 'x', token: 'stale' })
    ).toBe('unavailable');
  });

  it('checks until a token arrives, then passes', () => {
    const state = production('fixture-site-key');
    expect(resolveTurnstilePillState(state)).toBe('checking');
    expect(resolveTurnstilePillState({ ...state, token: 'token' })).toBe(
      'passed'
    );
    // A spent, reset or expired token clears to undefined and checks again.
    expect(resolveTurnstilePillState({ ...state, token: undefined })).toBe(
      'checking'
    );
  });

  it('fails on a widget error even if a token was held', () => {
    const state = production('fixture-site-key');
    expect(
      resolveTurnstilePillState({
        ...state,
        error: 'login.captcha_error',
        token: 'token',
      })
    ).toBe('failed');
  });
});
