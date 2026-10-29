import { describe, expect, it } from 'vitest';
import { mailAppPath } from './mail-mount';
import { applyMailResponsePolicy } from './response-policy';

describe('Mail host and app mount boundaries', () => {
  it.each([
    ['https://mail.tuturuuu.com/vi/personal/inbox', '/vi/personal/inbox'],
    ['https://tuturuuu.com/mail/vi/personal/inbox', '/vi/personal/inbox'],
    [
      'https://staging.tuturuuu.com/mail/api/v1/webhooks/mail/ses',
      '/api/v1/webhooks/mail/ses',
    ],
    [
      'https://mail-preview.example.test/api/v1/mail/connected/callback',
      '/api/v1/mail/connected/callback',
    ],
    ['https://tuturuuu.com/mail', '/'],
    ['https://tuturuuu.com/mailbox', null],
    ['https://tuturuuu.com/api/v1/mail/connected/callback', null],
  ])('resolves only the app-owned path for %s', (url, expected) => {
    expect(mailAppPath(new Request(url))).toBe(expected);
  });
  it.each(['https://mail.tuturuuu.com', 'https://tuturuuu.com/mail'])(
    'preserves authenticated attachment range, cookies and framing on %s',
    async (base) => {
      const request = new Request(
        `${base}/api/v1/workspaces/tenant/mail/mailboxes/box/messages/message/attachments/object`
      );
      const source = new Response('bytes', {
        status: 206,
        headers: {
          'content-range': 'bytes 2-6/9',
          'cache-control': 'private, max-age=60',
          'content-security-policy':
            "sandbox; default-src 'none'; frame-ancestors 'self'",
        },
      });
      source.headers.append('set-cookie', 'first=fixture; HttpOnly');
      source.headers.append('set-cookie', 'second=fixture; HttpOnly');
      const response = applyMailResponsePolicy(request, source);
      expect(response.status).toBe(206);
      expect(await response.text()).toBe('bytes');
      expect(response.headers.get('content-range')).toBe('bytes 2-6/9');
      expect(response.headers.get('cache-control')).toBe('private, max-age=60');
      expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(response.headers.get('x-robots-tag')).toBe(
        'noindex, nofollow, nosnippet'
      );
    }
  );
});
