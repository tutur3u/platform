import { describe, expect, it } from 'vitest';
import {
  generateMeetShortCode,
  isMeetLinkExpired,
  meetCanonicalJoinUrl,
  meetGeneratedExpiry,
  meetShortLinkUrl,
  meetShortLinksEnabled,
  meetSlugCode,
  meetStoredSlug,
  validateVanitySlug,
} from './meet-short-link-policy';

describe('meet short link policy', () => {
  it('stays off unless the server flag is exactly true', () => {
    expect(meetShortLinksEnabled({})).toBe(false);
    expect(meetShortLinksEnabled({ MEET_SHORT_LINKS_ENABLED: '1' })).toBe(
      false
    );
    expect(meetShortLinksEnabled({ MEET_SHORT_LINKS_ENABLED: 'true' })).toBe(
      true
    );
  });

  it('draws 7 uniform base62 symbols and skips biased bytes', () => {
    expect(generateMeetShortCode()).toMatch(/^[A-Za-z0-9]{7}$/);
    const biased = generateMeetShortCode((bytes) => bytes.fill(255).fill(0, 8));
    expect(biased).toBe('AAAAAAA');
  });

  it('builds the meet/ prefixed and root forms on ttr.gg', () => {
    expect(meetShortLinkUrl(meetStoredSlug('Ab3dE9x', true))).toBe(
      'https://ttr.gg/meet/Ab3dE9x'
    );
    expect(meetStoredSlug('Ab3dE9x', false)).toBe('Ab3dE9x');
    expect(meetSlugCode('meet/abc')).toEqual({ code: 'abc', prefixed: true });
    expect(meetSlugCode('abc')).toEqual({ code: 'abc', prefixed: false });
  });

  it('targets only the canonical tuturuuu.com/meet join URL', () => {
    expect(meetCanonicalJoinUrl('ws', 'm 1')).toBe(
      'https://tuturuuu.com/meet/ws/meetings/m%201'
    );
  });

  it('validates vanity slugs', () => {
    expect(validateVanitySlug('phuc-standup')).toBeNull();
    expect(validateVanitySlug('abc')).toBeNull();
    expect(validateVanitySlug('a'.repeat(40))).toBeNull();
    expect(validateVanitySlug('ab')).toBe('length');
    expect(validateVanitySlug('a'.repeat(41))).toBe('length');
    expect(validateVanitySlug('Phuc')).toBe('charset');
    expect(validateVanitySlug('a_b')).toBe('charset');
    expect(validateVanitySlug('-ab')).toBe('hyphen');
    expect(validateVanitySlug('ab-')).toBe('hyphen');
    expect(validateVanitySlug('a--b')).toBe('hyphen');
    expect(validateVanitySlug('api')).toBe('reserved');
    expect(validateVanitySlug('meet')).toBe('reserved');
  });

  it('expires generated links 30 days after the later of now and the meeting', () => {
    const now = Date.parse('2026-11-21T00:00:00.000Z');
    expect(meetGeneratedExpiry(null, now)).toBe('2026-12-21T00:00:00.000Z');
    expect(meetGeneratedExpiry('2026-01-01T00:00:00.000Z', now)).toBe(
      '2026-12-21T00:00:00.000Z'
    );
    expect(meetGeneratedExpiry('2026-12-01T00:00:00.000Z', now)).toBe(
      '2026-12-31T00:00:00.000Z'
    );
    expect(isMeetLinkExpired('2026-11-21T00:00:00.000Z', now)).toBe(true);
    expect(isMeetLinkExpired('garbage', now)).toBe(true);
    expect(isMeetLinkExpired(null, now)).toBe(false);
  });
});
