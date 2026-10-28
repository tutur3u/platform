import { expect, it } from 'vitest';
import { staff } from './index';

it('does not turn an email-only session into staff authority', () => {
  expect(staff({ email: 'staff@tuturuuu.com' })).toBe(false);
});
it('accepts only the server-verified staff assertion', () => {
  expect(staff({ email: 'staff@tuturuuu.com', staffVerified: true })).toBe(
    true
  );
});
