// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasContactsBindings,
  resetContactsBindingReportForTests,
} from './native-profile';

const identity = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  SUPABASE_SECRET_KEY: 'sb_secret_fixture',
  TUTURUUU_APP_COORDINATION_SECRET: 'coordination-fixture',
};
const rateLimitStore = {
  UPSTASH_REDIS_REST_URL: 'https://redis.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'rate-limit-fixture',
};

describe('Contacts native bindings', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetContactsBindingReportForTests();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('serves with the rate-limit store present and stays quiet', () => {
    expect(hasContactsBindings({ ...identity, ...rateLimitStore })).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('serves without the rate-limit store and warns once by name only', () => {
    expect(hasContactsBindings(identity)).toBe(true);
    expect(
      hasContactsBindings({ ...identity, UPSTASH_REDIS_REST_TOKEN: ' ' })
    ).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('UPSTASH_REDIS_REST_URL');
    expect(message).toContain('UPSTASH_REDIS_REST_TOKEN');
    for (const value of Object.values(identity)) {
      expect(message).not.toContain(value);
    }
  });

  it.each(Object.keys(identity))('fails closed without %s', (name) => {
    const env: Record<string, string> = { ...identity, ...rateLimitStore };
    delete env[name];
    expect(hasContactsBindings(env)).toBe(false);
    expect(hasContactsBindings({ ...env, [name]: '  ' })).toBe(false);
  });
});
