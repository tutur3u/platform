import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearCredentialCache,
  containsSuspiciousContent,
  contentFingerprint,
  domainMatches,
  extractDomain,
  getCachedCredential,
  getWorkspaceCredentialKey,
  hashEmailContent,
  hashIpAddress,
  hashUserId,
  invalidateCachedCredential,
  isDisposableDomain,
  maskCredential,
  maskEmail,
  maskEmails,
  spamScore,
} from '../security';

describe('Security Utilities', () => {
  describe('hashEmailContent', () => {
    it('generates consistent hash for same content', () => {
      const hash1 = hashEmailContent(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      const hash2 = hashEmailContent(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      expect(hash1).toBe(hash2);
    });

    it('generates different hash for different recipients', () => {
      const hash1 = hashEmailContent(
        ['a@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      const hash2 = hashEmailContent(
        ['b@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      expect(hash1).not.toBe(hash2);
    });

    it('generates different hash for different subject', () => {
      const hash1 = hashEmailContent(
        ['test@example.com'],
        'Subject 1',
        '<p>Hello</p>'
      );
      const hash2 = hashEmailContent(
        ['test@example.com'],
        'Subject 2',
        '<p>Hello</p>'
      );
      expect(hash1).not.toBe(hash2);
    });

    it('generates different hash for different content', () => {
      const hash1 = hashEmailContent(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      const hash2 = hashEmailContent(
        ['test@example.com'],
        'Subject',
        '<p>Goodbye</p>'
      );
      expect(hash1).not.toBe(hash2);
    });

    it('normalizes recipient order', () => {
      const hash1 = hashEmailContent(
        ['a@example.com', 'b@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      const hash2 = hashEmailContent(
        ['b@example.com', 'a@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      expect(hash1).toBe(hash2);
    });

    it('normalizes recipient case', () => {
      const hash1 = hashEmailContent(
        ['TEST@EXAMPLE.COM'],
        'Subject',
        '<p>Hello</p>'
      );
      const hash2 = hashEmailContent(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      expect(hash1).toBe(hash2);
    });

    it('returns 64-character hex string (SHA-256)', () => {
      const hash = hashEmailContent(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('contentFingerprint', () => {
    it('returns 12-character fingerprint', () => {
      const fingerprint = contentFingerprint(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      expect(fingerprint.length).toBe(12);
    });

    it('returns first 12 characters of hash', () => {
      const hash = hashEmailContent(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      const fingerprint = contentFingerprint(
        ['test@example.com'],
        'Subject',
        '<p>Hello</p>'
      );
      expect(hash.startsWith(fingerprint)).toBe(true);
    });
  });

  describe('maskCredential', () => {
    it('masks middle of credential', () => {
      const masked = maskCredential('abcdefghij1234567890');
      expect(masked.startsWith('abcd')).toBe(true);
      expect(masked.endsWith('7890')).toBe(true);
      expect(masked).toContain('*');
    });

    it('masks short credentials completely', () => {
      const masked = maskCredential('short');
      expect(masked).toBe('*****');
    });

    it('handles empty string', () => {
      const masked = maskCredential('');
      expect(masked).toBe('');
    });

    it('respects custom visible chars', () => {
      const masked = maskCredential('abcdefghij1234567890', 2);
      expect(masked.startsWith('ab')).toBe(true);
      expect(masked.endsWith('90')).toBe(true);
    });
  });

  describe('maskEmail', () => {
    it('masks local part preserving first and last char', () => {
      const masked = maskEmail('john.doe@example.com');
      expect(masked).toMatch(/^j\*+e@example\.com$/);
    });

    it('masks short local parts completely', () => {
      const masked = maskEmail('ab@example.com');
      expect(masked).toBe('**@example.com');
    });

    it('preserves domain', () => {
      const masked = maskEmail('user@domain.co.uk');
      expect(masked.endsWith('@domain.co.uk')).toBe(true);
    });

    it('handles invalid email gracefully', () => {
      const masked = maskEmail('not-an-email');
      expect(masked).toBe('not-an-email');
    });
  });

  describe('maskEmails', () => {
    it('masks array of emails', () => {
      const masked = maskEmails(['john@example.com', 'jane@example.com']);
      expect(masked).toHaveLength(2);
      masked.forEach((email) => {
        expect(email).toContain('@');
        expect(email).toContain('*');
      });
    });

    it('handles empty array', () => {
      const masked = maskEmails([]);
      expect(masked).toHaveLength(0);
    });
  });

  describe('Credential Cache', () => {
    beforeEach(() => {
      clearCredentialCache();
    });

    describe('getCachedCredential', () => {
      it('fetches and caches value', async () => {
        const fetcher = vi.fn().mockResolvedValue('test-value');
        const result = await getCachedCredential('test-key', fetcher);
        expect(result).toBe('test-value');
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      it('returns cached value on subsequent calls', async () => {
        const fetcher = vi.fn().mockResolvedValue('test-value');
        await getCachedCredential('test-key', fetcher);
        const result = await getCachedCredential('test-key', fetcher);
        expect(result).toBe('test-value');
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      it('different keys have different cached values', async () => {
        const fetcher1 = vi.fn().mockResolvedValue('value-1');
        const fetcher2 = vi.fn().mockResolvedValue('value-2');

        const result1 = await getCachedCredential('key-1', fetcher1);
        const result2 = await getCachedCredential('key-2', fetcher2);

        expect(result1).toBe('value-1');
        expect(result2).toBe('value-2');
      });
    });

    describe('invalidateCachedCredential', () => {
      it('removes cached value', async () => {
        const fetcher = vi.fn().mockResolvedValue('test-value');
        await getCachedCredential('test-key', fetcher);

        const removed = invalidateCachedCredential('test-key');
        expect(removed).toBe(true);

        // Should fetch again after invalidation
        await getCachedCredential('test-key', fetcher);
        expect(fetcher).toHaveBeenCalledTimes(2);
      });

      it('returns false for non-existent key', () => {
        const removed = invalidateCachedCredential('non-existent');
        expect(removed).toBe(false);
      });
    });

    describe('clearCredentialCache', () => {
      it('clears all cached values', async () => {
        const fetcher1 = vi.fn().mockResolvedValue('value-1');
        const fetcher2 = vi.fn().mockResolvedValue('value-2');

        await getCachedCredential('key-1', fetcher1);
        await getCachedCredential('key-2', fetcher2);

        clearCredentialCache();

        // Should fetch again after clearing
        await getCachedCredential('key-1', fetcher1);
        await getCachedCredential('key-2', fetcher2);

        expect(fetcher1).toHaveBeenCalledTimes(2);
        expect(fetcher2).toHaveBeenCalledTimes(2);
      });
    });

    describe('getWorkspaceCredentialKey', () => {
      it('generates key with workspace prefix', () => {
        const key = getWorkspaceCredentialKey('ws-123');
        expect(key).toBe('ws-cred:ws-123');
      });
    });
  });

  describe('Domain Security', () => {
    describe('extractDomain', () => {
      it('extracts domain from email', () => {
        expect(extractDomain('user@example.com')).toBe('example.com');
      });

      it('handles subdomains', () => {
        expect(extractDomain('user@mail.example.co.uk')).toBe(
          'mail.example.co.uk'
        );
      });

      it('normalizes to lowercase', () => {
        expect(extractDomain('user@EXAMPLE.COM')).toBe('example.com');
      });

      it('returns null for invalid email', () => {
        expect(extractDomain('not-an-email')).toBeNull();
        expect(extractDomain('')).toBeNull();
      });
    });

    describe('isDisposableDomain', () => {
      it('identifies known disposable domains', () => {
        expect(isDisposableDomain('user@mailinator.com')).toBe(true);
        expect(isDisposableDomain('user@guerrillamail.com')).toBe(true);
        expect(isDisposableDomain('user@tempmail.com')).toBe(true);
      });

      it('returns false for normal domains', () => {
        expect(isDisposableDomain('user@gmail.com')).toBe(false);
        expect(isDisposableDomain('user@company.com')).toBe(false);
      });

      it('returns false for invalid email', () => {
        expect(isDisposableDomain('not-an-email')).toBe(false);
      });
    });

    describe('domainMatches', () => {
      it('returns true when domains match', () => {
        expect(domainMatches('user1@example.com', 'user2@example.com')).toBe(
          true
        );
      });

      it('returns false when domains differ', () => {
        expect(domainMatches('user@example.com', 'user@other.com')).toBe(false);
      });

      it('handles case differences', () => {
        expect(domainMatches('user@EXAMPLE.com', 'user@example.COM')).toBe(
          true
        );
      });

      it('returns false for invalid emails', () => {
        expect(domainMatches('invalid', 'user@example.com')).toBe(false);
        expect(domainMatches('user@example.com', 'invalid')).toBe(false);
      });
    });
  });

  describe('Content Security', () => {
    describe('containsSuspiciousContent', () => {
      it('detects javascript: URLs', () => {
        const result = containsSuspiciousContent(
          '<a href="javascript:alert(1)">Click</a>'
        );
        expect(result.suspicious).toBe(true);
        expect(result.reasons).toContain('Contains javascript: URL');
      });

      it('detects inline event handlers', () => {
        const result = containsSuspiciousContent(
          '<div onclick="alert(1)">Click</div>'
        );
        expect(result.suspicious).toBe(true);
        expect(result.reasons).toContain('Contains inline event handlers');
      });

      it('detects external form actions', () => {
        const result = containsSuspiciousContent(
          '<form action="https://evil.com/steal">'
        );
        expect(result.suspicious).toBe(true);
        expect(result.reasons).toContain('Contains external form action');
      });

      it('detects hidden iframes', () => {
        const result = containsSuspiciousContent(
          '<iframe style="display:none" src="...">'
        );
        expect(result.suspicious).toBe(true);
        expect(result.reasons).toContain('Contains hidden iframe');
      });

      it('returns not suspicious for clean content', () => {
        const result = containsSuspiciousContent(
          '<p>Hello <a href="https://example.com">World</a></p>'
        );
        expect(result.suspicious).toBe(false);
        expect(result.reasons).toHaveLength(0);
      });

      it('can detect multiple issues', () => {
        const result = containsSuspiciousContent(
          '<div onclick="alert(1)"><a href="javascript:void(0)">Click</a></div>'
        );
        expect(result.suspicious).toBe(true);
        expect(result.reasons.length).toBeGreaterThan(1);
      });
    });

    describe('spamScore', () => {
      it('returns 0 for clean content', () => {
        const score = spamScore(
          'Meeting Notes',
          '<p>Here are the notes from our meeting.</p>'
        );
        expect(score).toBe(0);
      });

      it('increases score for spam keywords in subject', () => {
        const score = spamScore(
          'FREE WINNER PRIZE!!!',
          '<p>Normal content</p>'
        );
        expect(score).toBeGreaterThan(0);
      });

      it('increases score for all caps subject', () => {
        const score = spamScore(
          'THIS IS ALL UPPERCASE',
          '<p>Normal content</p>'
        );
        expect(score).toBeGreaterThan(0);
      });

      it('increases score for spam content patterns', () => {
        const score = spamScore(
          'Subject',
          '<p>nigerian prince inheritance lottery</p>'
        );
        expect(score).toBeGreaterThan(30);
      });

      it('caps score at 100', () => {
        const score = spamScore(
          'FREE WINNER URGENT ACT NOW!!!',
          '<p>viagra cialis pharmacy nigerian prince lottery inheritance</p>'
        );
        expect(score).toBeLessThanOrEqual(100);
      });

      it('increases score for high link density', () => {
        const links = Array(20)
          .fill('<a href="http://spam.com">link</a>')
          .join(' ');
        const score = spamScore('Subject', `<p>Click ${links}</p>`);
        expect(score).toBeGreaterThan(0);
      });
    });
  });

  describe('Rate Limit Key Security', () => {
    describe('hashIpAddress', () => {
      it('returns 16-character hash', () => {
        const hash = hashIpAddress('192.168.1.1');
        expect(hash.length).toBe(16);
      });

      it('returns consistent hash for same IP', () => {
        const hash1 = hashIpAddress('192.168.1.1');
        const hash2 = hashIpAddress('192.168.1.1');
        expect(hash1).toBe(hash2);
      });

      it('returns different hash for different IPs', () => {
        const hash1 = hashIpAddress('192.168.1.1');
        const hash2 = hashIpAddress('192.168.1.2');
        expect(hash1).not.toBe(hash2);
      });

      it('handles IPv6 addresses', () => {
        const hash = hashIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
        expect(hash.length).toBe(16);
      });
    });

    describe('hashUserId', () => {
      it('returns 16-character hash', () => {
        const hash = hashUserId('user-123');
        expect(hash.length).toBe(16);
      });

      it('returns consistent hash for same user', () => {
        const hash1 = hashUserId('user-123');
        const hash2 = hashUserId('user-123');
        expect(hash1).toBe(hash2);
      });

      it('returns different hash for different users', () => {
        const hash1 = hashUserId('user-123');
        const hash2 = hashUserId('user-456');
        expect(hash1).not.toBe(hash2);
      });

      it('handles UUID format', () => {
        const hash = hashUserId('123e4567-e89b-12d3-a456-426614174000');
        expect(hash.length).toBe(16);
      });
    });
  });
});
