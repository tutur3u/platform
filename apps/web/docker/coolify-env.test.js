import { describe, expect, it } from 'vitest';
import coolifyEnv from './coolify-env.js';

const {
  applyCoolifyAppUrlFallbacks,
  resolveConfiguredOrigin,
  resolveCoolifyOrigin,
} = coolifyEnv;

describe('coolify-env', () => {
  it('normalizes full Coolify URLs to their origin', () => {
    expect(
      resolveConfiguredOrigin(
        'https://app.example.com,https://secondary.example.com'
      )
    ).toBe('https://app.example.com');
  });

  it('upgrades bare Coolify FQDN values to https origins', () => {
    expect(
      resolveConfiguredOrigin('app.example.com,secondary.example.com')
    ).toBe('https://app.example.com');
  });

  it('prefers COOLIFY_URL before COOLIFY_FQDN', () => {
    expect(
      resolveCoolifyOrigin({
        COOLIFY_URL: 'https://app.example.com',
        COOLIFY_FQDN: 'ignored.example.com',
      })
    ).toBe('https://app.example.com');
  });

  it('backfills Tuturuuu app URL envs from Coolify defaults', () => {
    const env = applyCoolifyAppUrlFallbacks({
      COOLIFY_URL: 'https://app.example.com',
    });

    expect(env.WEB_APP_URL).toBe('https://app.example.com');
    expect(env.NEXT_PUBLIC_WEB_APP_URL).toBe('https://app.example.com');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://app.example.com');
  });

  it('preserves explicit Tuturuuu app URL envs', () => {
    const env = applyCoolifyAppUrlFallbacks({
      COOLIFY_URL: 'https://app.example.com',
      NEXT_PUBLIC_APP_URL: 'https://configured.example.com',
    });

    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://configured.example.com');
    expect(env.WEB_APP_URL).toBe('https://app.example.com');
    expect(env.NEXT_PUBLIC_WEB_APP_URL).toBe('https://app.example.com');
  });
});
