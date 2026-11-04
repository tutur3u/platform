import { describe, expect, it } from 'vitest';
import {
  misconfiguredResponse,
  missingRequiredEnv,
  REQUIRED_ENV,
} from './required-env';

describe('track required Worker env', () => {
  const enforced = { TUTURUUU_REQUIRE_SECRETS: '1' };

  it('is not enforced without the production flag', () => {
    expect(missingRequiredEnv({})).toEqual([]);
  });

  it('reports every missing or empty name', () => {
    expect(missingRequiredEnv(enforced)).toEqual([...REQUIRED_ENV]);
    expect(
      missingRequiredEnv({ ...enforced, SUPABASE_SECRET_KEY: '' })
    ).toContain('SUPABASE_SECRET_KEY');
  });

  it('serves only when every name is set', () => {
    const env = {
      ...enforced,
      ...Object.fromEntries(REQUIRED_ENV.map((name) => [name, 'set'])),
    };
    expect(missingRequiredEnv(env)).toEqual([]);
    expect(misconfiguredResponse([])).toBeNull();
    expect(misconfiguredResponse(['SUPABASE_SECRET_KEY'])?.status).toBe(503);
  });
});
