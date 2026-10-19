import { describe, expect, it } from 'vitest';
import { nativeMethodStatus } from './mail-api-policy';
import { proxyMatches } from './proxy-bridge';

describe('Mail native transport policy', () => {
  it('allows only GET or JSON POST server functions', () => {
    expect(nativeMethodStatus('GET', null)).toBe(200);
    expect(nativeMethodStatus('POST', 'application/json; charset=utf-8')).toBe(
      200
    );
    for (const value of [null, 'text/plain', 'multipart/form-data'])
      expect(nativeMethodStatus('POST', value)).toBe(415);
    for (const method of ['HEAD', 'PUT', 'DELETE', 'OPTIONS'])
      expect(nativeMethodStatus(method, 'application/json')).toBe(405);
  });
  it('preserves the original Mail matcher exclusions', () => {
    for (const path of [
      '/sw.js',
      '/serwist/sw.js',
      '/monitoring',
      '/.well-known/x',
      '/clip.mp3',
      '/clip.wav',
      '/clip.ogg',
      '/clip.m4a',
    ])
      expect(proxyMatches(path)).toBe(false);
    for (const path of [
      '/api/v1/webhooks/mail/cloudflare',
      '/api/v1/webhooks/mail/ses',
      '/api/auth/logout',
      '/personal/inbox',
      '/vi/personal/sent',
      '/_mail/functions/id',
    ])
      expect(proxyMatches(path)).toBe(true);
  });
});
