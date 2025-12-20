import { describe, expect, it } from 'vitest';
import {
  DOMAIN_BLACKLIST_REGEX,
  EMAIL_BLACKLIST_REGEX,
  isValidBlacklistDomain,
  isValidBlacklistEmail,
} from '../validation';

describe('email blacklist validation utils', () => {
  describe('isValidBlacklistEmail', () => {
    it('accepts well-formed email addresses with TLD', () => {
      expect(isValidBlacklistEmail('user@example.com')).toBe(true);
      expect(isValidBlacklistEmail('first.last+tag@sub.domain.io')).toBe(true);
    });

    it('rejects email addresses without TLD', () => {
      expect(isValidBlacklistEmail('user@example')).toBe(false);
    });

    it('mirrors EMAIL_BLACKLIST_REGEX', () => {
      const sample = 'name+alias@sub.domain.com';
      expect(isValidBlacklistEmail(sample)).toBe(
        EMAIL_BLACKLIST_REGEX.test(sample)
      );
    });
  });

  describe('isValidBlacklistDomain', () => {
    it('accepts well-formed domains', () => {
      expect(isValidBlacklistDomain('example.com')).toBe(true);
      expect(isValidBlacklistDomain('sub.domain.co')).toBe(true);
    });

    it('rejects malformed domains', () => {
      expect(isValidBlacklistDomain('-example.com')).toBe(false);
      expect(isValidBlacklistDomain('example')).toBe(false);
    });

    it('mirrors DOMAIN_BLACKLIST_REGEX', () => {
      const sample = 'valid-domain.org';
      expect(isValidBlacklistDomain(sample)).toBe(
        DOMAIN_BLACKLIST_REGEX.test(sample)
      );
    });
  });
});
