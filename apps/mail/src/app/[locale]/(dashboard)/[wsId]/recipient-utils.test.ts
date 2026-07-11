import { describe, expect, it } from 'vitest';
import { parseRecipientInput } from './recipient-utils';

describe('parseRecipientInput', () => {
  it('retains display names while normalizing addresses', () => {
    expect(parseRecipientInput('Võ Hoàng Phúc <PHUCVO@TUTURUUU.COM>')).toEqual([
      {
        address: 'phucvo@tuturuuu.com',
        displayName: 'Võ Hoàng Phúc',
        valid: true,
      },
    ]);
  });

  it('supports multiple plain email addresses', () => {
    expect(parseRecipientInput('one@example.com two@example.com')).toHaveLength(
      2
    );
  });
});
