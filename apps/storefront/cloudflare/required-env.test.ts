import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  misconfiguredResponse,
  missingRequiredEnv,
  REQUIRED_ENV,
} from './required-env';

describe('storefront required Worker env', () => {
  const enforced = { TUTURUUU_REQUIRE_SECRETS: '1' };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is not enforced without the production flag', () => {
    expect(missingRequiredEnv({})).toEqual([]);
  });

  it('reports every missing or empty name', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(missingRequiredEnv(enforced)).toEqual([...REQUIRED_ENV]);
    expect(
      missingRequiredEnv({ ...enforced, INVENTORY_APP_URL: '' })
    ).toContain('INVENTORY_APP_URL');
  });

  it('refuses a non-production build', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const env = {
      ...enforced,
      ...Object.fromEntries(REQUIRED_ENV.map((name) => [name, 'set'])),
    };
    expect(missingRequiredEnv(env)).toEqual(['NODE_ENV=production']);
  });

  it('serves only when every name is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const env = {
      ...enforced,
      ...Object.fromEntries(REQUIRED_ENV.map((name) => [name, 'set'])),
    };
    expect(missingRequiredEnv(env)).toEqual([]);
    expect(misconfiguredResponse([])).toBeNull();
    expect(misconfiguredResponse(['INVENTORY_APP_URL'])?.status).toBe(503);
  });
});
