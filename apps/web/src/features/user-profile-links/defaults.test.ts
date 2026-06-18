import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_LINK_DEFAULTS,
  parseProfileLinkDefaultFields,
  parseProfileLinkDefaultMaxUses,
  resolveProfileLinkDefaultExpiresAt,
  resolveProfileLinkDefaults,
  serializeProfileLinkDefaultMaxUses,
} from './defaults';

describe('profile link defaults', () => {
  it('falls back to the workspace rollout defaults for missing config values', () => {
    expect(resolveProfileLinkDefaults({})).toEqual(
      DEFAULT_PROFILE_LINK_DEFAULTS
    );
  });

  it('parses valid config values', () => {
    expect(
      resolveProfileLinkDefaults({
        WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION: '7d',
        WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS:
          'email, phone, email, invalid',
        WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES: '4',
        WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES: 'false',
        WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH: 'false',
      })
    ).toEqual({
      expirationPreset: '7d',
      fields: ['email', 'phone'],
      maxUses: 4,
      prefillExistingValues: false,
      requiresAuth: false,
    });
  });

  it('falls back when fields or max uses are invalid', () => {
    expect(parseProfileLinkDefaultFields('invalid,email,email')).toEqual([
      'email',
    ]);
    expect(parseProfileLinkDefaultFields('invalid')).toEqual([
      'display_name',
      'full_name',
    ]);
    expect(parseProfileLinkDefaultMaxUses('0')).toBe(1);
    expect(parseProfileLinkDefaultMaxUses('not-a-number')).toBe(1);
  });

  it('supports unlimited max uses', () => {
    expect(parseProfileLinkDefaultMaxUses('unlimited')).toBeNull();
    expect(serializeProfileLinkDefaultMaxUses(null)).toBe('unlimited');
  });

  it('resolves expiration presets relative to link creation time', () => {
    const now = new Date('2026-06-18T12:00:00.000Z');

    expect(resolveProfileLinkDefaultExpiresAt('1d', now)?.toISOString()).toBe(
      '2026-06-19T12:00:00.000Z'
    );
    expect(resolveProfileLinkDefaultExpiresAt('30d', now)?.toISOString()).toBe(
      '2026-07-18T12:00:00.000Z'
    );
    expect(resolveProfileLinkDefaultExpiresAt('never', now)).toBeNull();
  });
});
