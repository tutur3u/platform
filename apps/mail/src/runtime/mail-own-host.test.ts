import { describe, expect, it } from 'vitest';
import { isOwnMailHost } from './mail-mount';

describe('isOwnMailHost', () => {
  it('accepts the artifact root host and mount hosts', () => {
    expect(
      isOwnMailHost(new Request('https://mail.tuturuuu.com/api/build-info'))
    ).toBe(true);
    expect(
      isOwnMailHost(new Request('https://tuturuuu.com/mail/api/build-info'))
    ).toBe(true);
  });

  it('rejects the other environment host', () => {
    expect(
      isOwnMailHost(new Request('https://mail.tutur3u.com/api/build-info'))
    ).toBe(false);
  });
});
