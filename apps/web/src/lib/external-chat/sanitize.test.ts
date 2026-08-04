import { describe, expect, it } from 'vitest';
import { sanitizeExternalChatRecord } from './sanitize';

describe('sanitizeExternalChatRecord', () => {
  it('removes credential-like fields recursively while retaining observations', () => {
    expect(
      sanitizeExternalChatRecord({
        connection: { ip: '203.0.113.8', authorization: 'Bearer value' },
        cookie: 'private',
        route: '/services',
        nested: { api_key: 'private', city: 'Example' },
      })
    ).toEqual({
      connection: { ip: '203.0.113.8' },
      route: '/services',
      nested: { city: 'Example' },
    });
  });

  it('bounds oversized structures', () => {
    const result = sanitizeExternalChatRecord({
      text: 'x'.repeat(5000),
      values: Array.from({ length: 150 }, (_, index) => index),
    });
    expect(String(result.text)).toHaveLength(4096);
    expect(result.values).toHaveLength(100);
  });
});
