import { describe, expect, it } from 'vitest';
import {
  normalizeCliEnv,
  resolveCliEnv,
  resolveTuturuuuOrigins,
  resolveUpskiiOrigins,
} from './cli-env';

describe('cli-env', () => {
  it('normalizes canonical env names and aliases', () => {
    expect(normalizeCliEnv('prod')).toBe('prod');
    expect(normalizeCliEnv('production')).toBe('prod');
    expect(normalizeCliEnv('staging')).toBe('staging');
    expect(normalizeCliEnv('stage')).toBe('staging');
    expect(normalizeCliEnv('sandbox')).toBe('sandbox');
    expect(normalizeCliEnv('local')).toBe('local');
    expect(normalizeCliEnv('dev')).toBe('local');
    expect(() => normalizeCliEnv('unknown')).toThrow(/Invalid --env/);
  });

  it('resolves precedence: explicit flag > TTR_ENV > configured > default', () => {
    expect(
      resolveCliEnv({
        configuredEnv: 'sandbox',
        defaultEnv: 'staging',
        env: { TTR_ENV: 'prod' },
        explicitFlag: 'local',
      })
    ).toBe('local');
    expect(
      resolveCliEnv({
        configuredEnv: 'sandbox',
        defaultEnv: 'staging',
        env: { TTR_ENV: 'prod' },
      })
    ).toBe('prod');
    expect(
      resolveCliEnv({
        configuredEnv: 'sandbox',
        defaultEnv: 'staging',
        env: {},
      })
    ).toBe('sandbox');
    expect(resolveCliEnv({ defaultEnv: 'staging', env: {} })).toBe('staging');
  });

  it('pins prod and staging Upskii origins regardless of env overrides', () => {
    expect(
      resolveUpskiiOrigins('prod', {
        UPSKII_LOCAL_APP_URL: 'https://evil.example',
      })
    ).toEqual({
      admin: 'https://admin.upskii.com',
      app: 'https://app.upskii.com',
      auth: 'https://upskii.com',
    });
    expect(resolveUpskiiOrigins('staging')).toEqual({
      admin: 'https://staging.admin.upskii.com',
      app: 'https://staging.app.upskii.com',
      auth: 'https://staging.upskii.com',
    });
  });

  it('rejects non-loopback local overrides', () => {
    expect(() =>
      resolveUpskiiOrigins('local', {
        UPSKII_LOCAL_APP_URL: 'https://app.upskii.com',
      })
    ).toThrow(/loopback/);
    expect(
      resolveUpskiiOrigins('local', {
        UPSKII_LOCAL_APP_URL: 'http://127.0.0.1:4101',
      }).app
    ).toBe('http://127.0.0.1:4101');
  });

  it('resolves Tuturuuu origins per environment', () => {
    expect(resolveTuturuuuOrigins('prod')).toEqual({
      admin: 'https://admin.tuturuuu.com',
      meet: 'https://meet.tuturuuu.com',
      tasks: 'https://tasks.tuturuuu.com',
      web: 'https://tuturuuu.com',
    });
    expect(resolveTuturuuuOrigins('staging')).toEqual({
      admin: 'https://infra.tutur3u.com',
      meet: 'https://meet.tutur3u.com',
      tasks: 'https://tasks.tutur3u.com',
      web: 'https://web.tutur3u.com',
    });
    expect(resolveTuturuuuOrigins('sandbox').web).toBe(
      'https://sandbox.web.tutur3u.com'
    );
  });
});
