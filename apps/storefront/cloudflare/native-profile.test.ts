import { describe, expect, it } from 'vitest';
import profiles from './native-profiles.json';
import {
  applyStorefrontNativeProfileEnv,
  resolveStorefrontNativeProfile,
  STOREFRONT_NATIVE_PROFILE_ENV,
} from './native-profile';

const REAL_KEY = 'sb_publishable_fixture_value';
const production = () => ({
  [STOREFRONT_NATIVE_PROFILE_ENV]: 'production',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: REAL_KEY,
});

describe('storefront native profile', () => {
  it('defaults to the staging identity', () => {
    const profile = resolveStorefrontNativeProfile(undefined);

    expect(profile.name).toBe('staging');
    expect(profile.workerName).toBe('tuturuuu-storefront-vite-staging');
    expect(profile.vars).toEqual({ TUTURUUU_NOINDEX: '1' });
  });

  it('rejects an unknown profile name', () => {
    expect(() => resolveStorefrontNativeProfile('preview')).toThrow(
      `Unknown ${STOREFRONT_NATIVE_PROFILE_ENV}: preview`
    );
  });

  it('keeps production on the canonical host and out of staging', () => {
    const profile = resolveStorefrontNativeProfile('production');

    expect(profile.rootHost).toBe('store.tuturuuu.com');
    expect(profile.aliasHosts).toContain('storefront.tuturuuu.com');
    expect(profile.workerName).not.toContain('staging');
    expect(profile.vars.TUTURUUU_NOINDEX).toBe('0');
    expect(profile.vars.NEXT_PUBLIC_APP_URL).toBe(
      `https://${profile.rootHost}`
    );
    expect(JSON.stringify(profile.vars)).not.toMatch(
      /tutur3u\.com|fxefojytwimjiqxseqag|\.invalid/u
    );
    for (const alias of profile.aliasHosts) {
      expect(JSON.stringify(profile.vars)).not.toContain(alias);
    }
  });

  it('does not touch the environment for staging', () => {
    const env: Record<string, string | undefined> = {
      NEXT_PUBLIC_APP_URL: 'http://localhost:7822',
    };

    expect(applyStorefrontNativeProfileEnv(env).name).toBe('staging');
    expect(env).toEqual({ NEXT_PUBLIC_APP_URL: 'http://localhost:7822' });
  });

  it('fills the unset public values of the production profile', () => {
    const env: Record<string, string | undefined> = production();

    applyStorefrontNativeProfileEnv(env);

    for (const [name, value] of Object.entries(profiles.production.vars)) {
      if (name.startsWith('NEXT_PUBLIC_')) expect(env[name]).toBe(value);
    }
  });

  it('turns the redirect alias given as the app URL into the canonical origin', () => {
    for (const alias of profiles.production.aliasHosts) {
      const env: Record<string, string | undefined> = {
        ...production(),
        NEXT_PUBLIC_APP_URL: `https://${alias}`,
        NEXT_PUBLIC_STOREFRONT_APP_URL: `https://${alias}`,
      };

      applyStorefrontNativeProfileEnv(env);

      expect(env.NEXT_PUBLIC_APP_URL).toBe('https://store.tuturuuu.com');
      expect(env.NEXT_PUBLIC_STOREFRONT_APP_URL).toBe(
        'https://store.tuturuuu.com'
      );
    }
  });

  it.each([
    ['NEXT_PUBLIC_APP_URL', 'https://storefront.tutur3u.com'],
    ['NEXT_PUBLIC_APP_URL', 'http://localhost:7822'],
    ['NEXT_PUBLIC_WEB_APP_URL', 'https://storefront.tuturuuu.com'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'https://fxefojytwimjiqxseqag.supabase.co'],
  ])('fails the production build on a conflicting %s', (name, value) => {
    const env: Record<string, string | undefined> = {
      ...production(),
      [name]: value,
    };

    expect(() => applyStorefrontNativeProfileEnv(env)).toThrow(
      `${name} conflicts with the production Storefront native profile`
    );
  });

  it.each([undefined, '', 'sb_publishable_storefront_ci_placeholder'])(
    'requires a real publishable key for production (%s)',
    (key) => {
      const env: Record<string, string | undefined> = {
        ...production(),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      };

      expect(() => applyStorefrontNativeProfileEnv(env)).toThrow(
        'requires a real NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
      );
    }
  );
});
