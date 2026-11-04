import { describe, expect, it } from 'vitest';
import { REQUIRED_SECRETS, startupRefusal } from './startup';

const production = { TUTURUUU_REQUIRE_SECRETS: '1' };
const secrets = Object.fromEntries(
  REQUIRED_SECRETS.map((name) => [name, 'set'])
);

describe('tasks Worker startup', () => {
  it('serves fixture configs without the production flag', () => {
    expect(startupRefusal({})).toBeNull();
  });

  it('refuses production when a required secret is missing', () => {
    expect(startupRefusal(production)?.status).toBe(503);
  });

  it('serves production when every required secret is set', () => {
    // Vitest runs with NODE_ENV=test; the build inlines production.
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(startupRefusal({ ...production, ...secrets })).toBeNull();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('refuses a non-production build under the production flag', () => {
    expect(startupRefusal({ ...production, ...secrets })?.status).toBe(503);
  });
});
