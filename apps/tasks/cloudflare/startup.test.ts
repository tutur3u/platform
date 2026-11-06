import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRED_SECRETS, startupRefusal } from './startup';

const secrets = Object.fromEntries(
  REQUIRED_SECRETS.map((name) => [name, 'fixture'])
);

describe('tasks Worker startup', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([undefined, '', '0', '1'])(
    'refuses missing secrets with flag %s',
    (flag) => {
      const response = startupRefusal({ TUTURUUU_REQUIRE_SECRETS: flag });
      expect(response?.status).toBe(503);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    }
  );

  it.each(REQUIRED_SECRETS)('requires %s without a runtime flag', (name) => {
    for (const value of [undefined, '', ' \t\n']) {
      expect(startupRefusal({ ...secrets, [name]: value })?.status).toBe(503);
    }
  });

  it('serves when every required secret is set without a runtime flag', () => {
    expect(startupRefusal(secrets)).toBeNull();
  });

  it('refuses a non-production build even with all secrets set', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(startupRefusal(secrets)?.status).toBe(503);
  });
});
