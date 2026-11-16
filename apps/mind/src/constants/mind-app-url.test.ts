import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared satellite constants load next-intl navigation, which this
// URL-only module test does not need.
vi.mock('@tuturuuu/satellite/constants', () => ({
  DEV_MODE: false,
  LOCALE_COOKIE_NAME: 'NEXT_LOCALE',
  PROD_MODE: true,
  PUBLIC_PATHS: [],
  SHOW_TAILWIND_INDICATOR: false,
  SIDEBAR_BEHAVIOR_COOKIE_NAME: 'sidebar-behavior',
  SIDEBAR_COLLAPSED_COOKIE_NAME: 'sidebar-collapsed',
  THEME_COOKIE_NAME: 'NEXT_THEME',
}));

describe('Mind canonical app base', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITE_MIND_NATIVE_PROFILE', 'production');
    for (const name of [
      'MIND_APP_URL',
      'NEXT_PUBLIC_MIND_APP_URL',
      'NEXT_PUBLIC_APP_URL',
      'BASE_URL',
    ]) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(() => vi.unstubAllEnvs());

  it('defaults the production profile to the canonical mount', async () => {
    expect((await import('./common')).MIND_APP_URL).toBe(
      'https://tuturuuu.com/mind'
    );
  });

  it('accepts only the exact canonical apex mount', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com/mind/');
    expect((await import('./common')).MIND_APP_URL).toBe(
      'https://tuturuuu.com/mind'
    );
  });

  it('uses the declared mount rather than a retained subdomain candidate', async () => {
    vi.stubEnv('MIND_APP_URL', 'https://mind.tuturuuu.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com/mind');
    expect((await import('./common')).MIND_APP_URL).toBe(
      'https://tuturuuu.com/mind'
    );
  });

  it.each([
    'https://tuturuuu.com/finance',
    'https://tuturuuu.com/mindful',
    'https://tuturuuu.com/mind?next=outside',
    'https://tuturuuu.com/mind#outside',
    'https://user@tuturuuu.com/mind',
    'http://tuturuuu.com/mind',
  ])('does not select another apex URL %j', async (candidate) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', candidate);
    expect((await import('./common')).MIND_APP_URL).toBe(
      'https://tuturuuu.com/mind'
    );
  });

  it('preserves the local developer app origin', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MIND_APP_URL', 'http://localhost:7816');
    expect((await import('./common')).MIND_APP_URL).toBe(
      'http://localhost:7816'
    );
  });
});

describe('Mind app base outside the production profile', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    for (const name of [
      'MIND_APP_URL',
      'NEXT_PUBLIC_MIND_APP_URL',
      'NEXT_PUBLIC_APP_URL',
      'BASE_URL',
    ]) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(['staging', ''])(
    'defaults the %j profile to the subdomain',
    async (profile) => {
      vi.stubEnv('VITE_MIND_NATIVE_PROFILE', profile);
      expect((await import('./common')).MIND_APP_URL).toBe(
        'https://mind.tuturuuu.com'
      );
    }
  );

  it('keeps an apex candidate other than the exact mount off the subdomain', async () => {
    vi.stubEnv('VITE_MIND_NATIVE_PROFILE', 'staging');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com/mindful');
    expect((await import('./common')).MIND_APP_URL).toBe(
      'https://mind.tuturuuu.com'
    );
  });

  it('still honours an explicit mount URL', async () => {
    vi.stubEnv('VITE_MIND_NATIVE_PROFILE', 'staging');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com/mind');
    expect((await import('./common')).MIND_APP_URL).toBe(
      'https://tuturuuu.com/mind'
    );
  });
});
