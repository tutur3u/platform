import { expect, it } from 'vitest';
import { validPaymentProof } from './payment-proof';

it('accepts canonical media bytes and rejects mislabeled, noncanonical and oversized payloads', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  expect(validPaymentProof({ contentType: 'image/png', base64: png })).toBe(
    true
  );
  expect(validPaymentProof({ contentType: 'image/webp', base64: png })).toBe(
    false
  );
  expect(
    validPaymentProof({ contentType: 'image/png', base64: `${png}\n` })
  ).toBe(false);
  const oversized = Buffer.alloc(262145);
  Buffer.from(png, 'base64').copy(oversized);
  expect(
    validPaymentProof({
      contentType: 'image/png',
      base64: oversized.toString('base64'),
    })
  ).toBe(false);
});
