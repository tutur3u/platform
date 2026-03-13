import { describe, expect, it } from 'vitest';
import { extractIPFromRequest } from '../edge';

describe('abuse-protection edge', () => {
  describe('extractIPFromRequest', () => {
    it('prefers cf-connecting-ip over x-forwarded-for', () => {
      const headers = new Headers();
      headers.set('cf-connecting-ip', '203.0.113.10');
      headers.set('x-forwarded-for', '198.51.100.10, 10.0.0.1');

      expect(extractIPFromRequest(headers)).toBe('203.0.113.10');
    });

    it('falls back to true-client-ip before generic proxy headers', () => {
      const headers = new Headers();
      headers.set('true-client-ip', '203.0.113.20');
      headers.set('x-forwarded-for', '198.51.100.20, 10.0.0.1');

      expect(extractIPFromRequest(headers)).toBe('203.0.113.20');
    });

    it('falls back to x-forwarded-for when cloud proxy headers are absent', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '198.51.100.30, 10.0.0.1');

      expect(extractIPFromRequest(headers)).toBe('198.51.100.30');
    });
  });
});
