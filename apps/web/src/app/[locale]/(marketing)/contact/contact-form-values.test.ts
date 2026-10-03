import { expect, it } from 'vitest';
import { inquiryPrefillName } from './contact-form-values';

it('keeps the disabled name prefill within the inquiry limit without splitting Unicode', () => {
  expect(inquiryPrefillName('n'.repeat(100))).toBe('n'.repeat(64));
  expect(inquiryPrefillName(`${'n'.repeat(63)}😀`)).toBe(`${'n'.repeat(63)}😀`);
  expect(inquiryPrefillName('😀'.repeat(80))).toBe('😀'.repeat(64));
  expect(inquiryPrefillName('Synthetic Creator')).toBe('Synthetic Creator');
});
