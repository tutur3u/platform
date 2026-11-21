import { describe, expect, it } from 'vitest';
import {
  AUTH_OAUTH_PROVIDER_OPTIONS,
  AUTH_OAUTH_PROVIDERS,
} from './oauth-providers';

describe('auth OAuth providers', () => {
  it('does not expose generic Microsoft Azure for account login or linking', () => {
    expect(AUTH_OAUTH_PROVIDERS).toEqual(['apple', 'google', 'github']);
    expect(AUTH_OAUTH_PROVIDERS).not.toContain('azure');
    expect(Object.keys(AUTH_OAUTH_PROVIDER_OPTIONS)).not.toContain('azure');
  });
});
