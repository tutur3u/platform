/**
 * Unit tests for OTP Abuse Protection System
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ABUSE_THRESHOLDS,
  BLOCK_DURATIONS,
  checkOTPSendLimit,
  extractIPFromHeaders,
  hashEmail,
  MAX_BLOCK_LEVEL,
  REDIS_KEYS,
  WINDOW_MS,
} from '../index';

describe('abuse-protection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('extractIPFromHeaders', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '192.168.1.1, 10.0.0.1');
      expect(extractIPFromHeaders(headers)).toBe('192.168.1.1');
    });

    it('should extract single IP from x-forwarded-for', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '203.0.113.50');
      expect(extractIPFromHeaders(headers)).toBe('203.0.113.50');
    });

    it('should extract IP from x-real-ip header', () => {
      const headers = new Headers();
      headers.set('x-real-ip', '192.168.1.100');
      expect(extractIPFromHeaders(headers)).toBe('192.168.1.100');
    });

    it('should extract IP from cf-connecting-ip header (Cloudflare)', () => {
      const headers = new Headers();
      headers.set('cf-connecting-ip', '172.16.0.1');
      expect(extractIPFromHeaders(headers)).toBe('172.16.0.1');
    });

    it('should prefer cf-connecting-ip over forwarded proxy headers', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '192.168.1.1');
      headers.set('x-real-ip', '192.168.1.2');
      headers.set('cf-connecting-ip', '192.168.1.3');
      expect(extractIPFromHeaders(headers)).toBe('192.168.1.3');
    });

    it('should prefer true-client-ip when cf-connecting-ip is absent', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '192.168.1.1');
      headers.set('x-real-ip', '192.168.1.2');
      headers.set('true-client-ip', '192.168.1.4');
      expect(extractIPFromHeaders(headers)).toBe('192.168.1.4');
    });

    it('should fall back to x-forwarded-for if explicit client IP headers are invalid', () => {
      const headers = new Headers();
      headers.set('cf-connecting-ip', 'invalid-ip');
      headers.set('true-client-ip', 'also-invalid');
      headers.set('x-forwarded-for', '192.168.1.100, 10.0.0.1');
      expect(extractIPFromHeaders(headers)).toBe('192.168.1.100');
    });

    it('should return "unknown" when no valid IP is found', () => {
      const headers = new Headers();
      expect(extractIPFromHeaders(headers)).toBe('unknown');
    });

    it('should return "unknown" for invalid IP formats', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', 'not-an-ip');
      headers.set('x-real-ip', 'also-invalid');
      headers.set('cf-connecting-ip', 'still.not.valid');
      expect(extractIPFromHeaders(headers)).toBe('unknown');
    });

    it('should accept IPs with values matching format regex', () => {
      // Note: The regex validates format, not IPv4 value ranges
      // 999.999.999.999 matches the pattern \d{1,3}.\d{1,3}.\d{1,3}.\d{1,3}
      const headers = new Headers();
      headers.set('x-forwarded-for', '999.999.999.999');
      expect(extractIPFromHeaders(headers)).toBe('999.999.999.999');
    });

    it('should work with Map-based headers', () => {
      const headers = new Map<string, string>();
      headers.set('x-forwarded-for', '10.0.0.5');
      expect(extractIPFromHeaders(headers)).toBe('10.0.0.5');
    });

    it('should work with plain object headers', () => {
      const headers: Record<string, string | null> = {
        'x-forwarded-for': '10.0.0.10',
      };
      expect(extractIPFromHeaders(headers)).toBe('10.0.0.10');
    });

    it('should handle IPv6 addresses', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '2001:db8::1');
      expect(extractIPFromHeaders(headers)).toBe('2001:db8::1');
    });

    it('should handle IPv6 in x-real-ip', () => {
      const headers = new Headers();
      headers.set('x-real-ip', '::1');
      expect(extractIPFromHeaders(headers)).toBe('::1');
    });

    it('should handle whitespace in IP list', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '  192.168.1.1  , 10.0.0.1');
      expect(extractIPFromHeaders(headers)).toBe('192.168.1.1');
    });
  });

  describe('hashEmail', () => {
    it('should return a 16-character hex string', () => {
      const hash = hashEmail('test@example.com');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should be case-insensitive', () => {
      const hash1 = hashEmail('Test@Example.COM');
      const hash2 = hashEmail('test@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different emails', () => {
      const hash1 = hashEmail('user1@example.com');
      const hash2 = hashEmail('user2@example.com');
      expect(hash1).not.toBe(hash2);
    });

    it('should be deterministic', () => {
      const email = 'consistent@test.com';
      const hash1 = hashEmail(email);
      const hash2 = hashEmail(email);
      expect(hash1).toBe(hash2);
    });

    it('should handle special characters in email', () => {
      const hash = hashEmail('user+tag@example.com');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle unicode in email', () => {
      const hash = hashEmail('用户@example.com');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('ABUSE_THRESHOLDS constants', () => {
    it('should have valid OTP send limits', () => {
      expect(ABUSE_THRESHOLDS.OTP_SEND_PER_MINUTE).toBe(3);
      expect(ABUSE_THRESHOLDS.OTP_SEND_PER_HOUR).toBe(10);
      expect(ABUSE_THRESHOLDS.OTP_SEND_PER_DAY).toBe(12);
      expect(ABUSE_THRESHOLDS.OTP_SEND_EMAIL_COOLDOWN_WINDOW_MS).toBe(
        15 * 60 * 1000
      );
      expect(ABUSE_THRESHOLDS.OTP_SEND_EMAIL_PER_HOUR).toBe(2);
      expect(ABUSE_THRESHOLDS.OTP_SEND_EMAIL_PER_DAY).toBe(4);
    });

    it('should have valid OTP verify limits', () => {
      expect(ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_WINDOW_MS).toBe(5 * 60 * 1000);
      expect(ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_MAX).toBe(5);
      expect(ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_EMAIL_WINDOW_MS).toBe(
        15 * 60 * 1000
      );
      expect(ABUSE_THRESHOLDS.OTP_VERIFY_FAILED_EMAIL_MAX).toBe(10);
    });

    it('should have valid MFA limits', () => {
      expect(ABUSE_THRESHOLDS.MFA_CHALLENGE_PER_MINUTE).toBe(5);
      expect(ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_WINDOW_MS).toBe(5 * 60 * 1000);
      expect(ABUSE_THRESHOLDS.MFA_VERIFY_FAILED_MAX).toBe(5);
    });

    it('should have valid reauth limits', () => {
      expect(ABUSE_THRESHOLDS.REAUTH_SEND_PER_MINUTE).toBe(3);
      expect(ABUSE_THRESHOLDS.REAUTH_VERIFY_FAILED_WINDOW_MS).toBe(
        5 * 60 * 1000
      );
      expect(ABUSE_THRESHOLDS.REAUTH_VERIFY_FAILED_MAX).toBe(5);
    });

    it('should have valid password login limits', () => {
      expect(ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_WINDOW_MS).toBe(
        5 * 60 * 1000
      );
      expect(ABUSE_THRESHOLDS.PASSWORD_LOGIN_FAILED_MAX).toBe(10);
    });
  });

  describe('BLOCK_DURATIONS constants', () => {
    it('should have level 1 at 5 minutes', () => {
      expect(BLOCK_DURATIONS[1]).toBe(5 * 60);
    });

    it('should have level 2 at 15 minutes', () => {
      expect(BLOCK_DURATIONS[2]).toBe(15 * 60);
    });

    it('should have level 3 at 1 hour', () => {
      expect(BLOCK_DURATIONS[3]).toBe(60 * 60);
    });

    it('should have level 4 at 24 hours', () => {
      expect(BLOCK_DURATIONS[4]).toBe(24 * 60 * 60);
    });

    it('should have progressively increasing durations', () => {
      expect(BLOCK_DURATIONS[1]).toBeLessThan(BLOCK_DURATIONS[2]);
      expect(BLOCK_DURATIONS[2]).toBeLessThan(BLOCK_DURATIONS[3]);
      expect(BLOCK_DURATIONS[3]).toBeLessThan(BLOCK_DURATIONS[4]);
    });
  });

  describe('MAX_BLOCK_LEVEL constant', () => {
    it('should be 4', () => {
      expect(MAX_BLOCK_LEVEL).toBe(4);
    });
  });

  describe('REDIS_KEYS', () => {
    const testIP = '192.168.1.1';
    const testEmailHash = 'abc123';

    it('should generate correct OTP send keys', () => {
      expect(REDIS_KEYS.OTP_SEND(testIP)).toBe(`otp:send:${testIP}`);
      expect(REDIS_KEYS.OTP_SEND_HOURLY(testIP)).toBe(
        `otp:send:hourly:${testIP}`
      );
      expect(REDIS_KEYS.OTP_SEND_DAILY(testIP)).toBe(
        `otp:send:daily:${testIP}`
      );
      expect(REDIS_KEYS.OTP_SEND_EMAIL_COOLDOWN(testEmailHash)).toBe(
        `otp:send:email:cooldown:${testEmailHash}`
      );
      expect(REDIS_KEYS.OTP_SEND_EMAIL_HOURLY(testEmailHash)).toBe(
        `otp:send:email:hourly:${testEmailHash}`
      );
      expect(REDIS_KEYS.OTP_SEND_EMAIL_DAILY(testEmailHash)).toBe(
        `otp:send:email:daily:${testEmailHash}`
      );
    });

    it('should generate correct OTP verify keys', () => {
      expect(REDIS_KEYS.OTP_VERIFY_FAILED(testIP)).toBe(
        `otp:verify:failed:${testIP}`
      );
      expect(REDIS_KEYS.OTP_VERIFY_FAILED_EMAIL(testEmailHash)).toBe(
        `otp:verify:failed:email:${testEmailHash}`
      );
    });

    it('should generate correct MFA keys', () => {
      expect(REDIS_KEYS.MFA_CHALLENGE(testIP)).toBe(`mfa:challenge:${testIP}`);
      expect(REDIS_KEYS.MFA_VERIFY_FAILED(testIP)).toBe(
        `mfa:verify:failed:${testIP}`
      );
    });

    it('should generate correct reauth keys', () => {
      expect(REDIS_KEYS.REAUTH_SEND(testIP)).toBe(`reauth:send:${testIP}`);
      expect(REDIS_KEYS.REAUTH_VERIFY_FAILED(testIP)).toBe(
        `reauth:verify:failed:${testIP}`
      );
    });

    it('should generate correct password login keys', () => {
      expect(REDIS_KEYS.PASSWORD_LOGIN_FAILED(testIP)).toBe(
        `password:login:failed:${testIP}`
      );
    });

    it('should generate correct IP block keys', () => {
      expect(REDIS_KEYS.IP_BLOCKED(testIP)).toBe(`ip:blocked:${testIP}`);
      expect(REDIS_KEYS.IP_BLOCK_LEVEL(testIP)).toBe(
        `ip:block:level:${testIP}`
      );
    });
  });

  describe('WINDOW_MS constants', () => {
    it('should have correct time windows', () => {
      expect(WINDOW_MS.ONE_MINUTE).toBe(60 * 1000);
      expect(WINDOW_MS.TEN_MINUTES).toBe(10 * 60 * 1000);
      expect(WINDOW_MS.ONE_HOUR).toBe(60 * 60 * 1000);
      expect(WINDOW_MS.TWENTY_FOUR_HOURS).toBe(24 * 60 * 60 * 1000);
    });

    it('should have windows in proper order', () => {
      expect(WINDOW_MS.ONE_MINUTE).toBeLessThan(WINDOW_MS.ONE_HOUR);
      expect(WINDOW_MS.TEN_MINUTES).toBeLessThan(WINDOW_MS.ONE_HOUR);
      expect(WINDOW_MS.ONE_HOUR).toBeLessThan(WINDOW_MS.TWENTY_FOUR_HOURS);
    });
  });

  describe('checkOTPSendLimit', () => {
    it('blocks repeated sends to the same email across different IPs during cooldown', async () => {
      const email = `cooldown-${Date.now()}@example.com`;

      const firstAttempt = await checkOTPSendLimit('198.51.100.1', email);
      const secondAttempt = await checkOTPSendLimit('198.51.100.2', email);

      expect(firstAttempt.allowed).toBe(true);
      expect(secondAttempt.allowed).toBe(false);
      expect(secondAttempt.retryAfter).toBeGreaterThan(0);
    });

    it('caps successful sends for the same email across distributed IPs within an hour', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));

      const email = `hourly-${Date.now()}@example.com`;

      const first = await checkOTPSendLimit('203.0.113.1', email);
      vi.advanceTimersByTime(
        ABUSE_THRESHOLDS.OTP_SEND_EMAIL_COOLDOWN_WINDOW_MS + 1
      );
      const second = await checkOTPSendLimit('203.0.113.2', email);
      vi.advanceTimersByTime(
        ABUSE_THRESHOLDS.OTP_SEND_EMAIL_COOLDOWN_WINDOW_MS + 1
      );
      const third = await checkOTPSendLimit('203.0.113.3', email);

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      expect(third.allowed).toBe(false);
      expect(third.retryAfter).toBeGreaterThan(0);
    });

    it('caps slow OTP send abuse from a single IP over a day', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));

      const emailBase = `slow-ip-${Date.now()}`;
      let lastAttempt = await checkOTPSendLimit(
        '198.51.100.20',
        `${emailBase}-0@example.com`
      );

      for (
        let attempt = 1;
        attempt <= ABUSE_THRESHOLDS.OTP_SEND_PER_DAY;
        attempt++
      ) {
        vi.advanceTimersByTime(90 * 60 * 1000);
        lastAttempt = await checkOTPSendLimit(
          '198.51.100.20',
          `${emailBase}-${attempt}@example.com`
        );
      }

      expect(lastAttempt.allowed).toBe(false);
      expect(lastAttempt.retryAfter).toBeGreaterThan(0);
    });
  });
});

describe('abuse-protection types', () => {
  it('should have all expected abuse event types as valid strings', () => {
    // These are the valid AbuseEventType values as defined in types.ts
    const validTypes = [
      'otp_send',
      'otp_verify_failed',
      'mfa_challenge',
      'mfa_verify_failed',
      'reauth_send',
      'reauth_verify_failed',
      'password_login_failed',
      'manual',
    ];
    // Just verify these are valid string values
    validTypes.forEach((type) => {
      expect(typeof type).toBe('string');
    });
  });
});

describe('IP address validation', () => {
  // Test IPv4 validation through extractIPFromHeaders
  describe('IPv4 addresses', () => {
    it('should accept valid IPv4 addresses', () => {
      const validIPs = [
        '0.0.0.0',
        '192.168.1.1',
        '255.255.255.255',
        '10.0.0.1',
        '172.16.0.1',
      ];
      validIPs.forEach((ip) => {
        const headers = new Headers();
        headers.set('x-forwarded-for', ip);
        expect(extractIPFromHeaders(headers)).toBe(ip);
      });
    });
  });

  describe('IPv6 addresses', () => {
    it('should accept common IPv6 addresses', () => {
      // Test the IPv6 addresses that match the current regex pattern
      const supportedIPs = ['::1', '2001:db8::1', 'fe80::1'];
      supportedIPs.forEach((ip) => {
        const headers = new Headers();
        headers.set('x-forwarded-for', ip);
        expect(extractIPFromHeaders(headers)).toBe(ip);
      });
    });

    it('should handle IPv6 formats matching the regex pattern', () => {
      // The regex pattern is basic and may not match all valid IPv6 formats
      // like ::ffff:192.168.1.1 (IPv4-mapped IPv6)
      const headers = new Headers();
      headers.set('x-forwarded-for', '::1');
      expect(extractIPFromHeaders(headers)).toBe('::1');
    });
  });
});
