import { describe, expect, it } from 'vitest';
import { redactSensitiveUrl } from './redact-url';

describe('redactSensitiveUrl', () => {
  it('masks cross-app tokens and OAuth codes', () => {
    expect(
      redactSensitiveUrl(
        'https://tuturuuu.com/inventory/verify-token?nextUrl=%2Fx&token=secret&targetApp=inventory'
      )
    ).toBe(
      'https://tuturuuu.com/inventory/verify-token?nextUrl=%2Fx&token=redacted&targetApp=inventory'
    );
    expect(
      redactSensitiveUrl('https://tuturuuu.com/api/auth/callback?code=abc')
    ).toBe('https://tuturuuu.com/api/auth/callback?code=redacted');
  });

  it('drops parameter-bearing fragments', () => {
    expect(
      redactSensitiveUrl('https://tuturuuu.com/#access_token=a&type=recovery')
    ).toBe('https://tuturuuu.com/');
  });

  it.each([
    'https://tuturuuu.com/personal/tasks?view=list',
    'https://tuturuuu.com/docs#section',
    'not a url',
  ])('leaves %s unchanged', (url) => {
    expect(redactSensitiveUrl(url)).toBe(url);
  });
});
