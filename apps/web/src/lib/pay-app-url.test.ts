import { afterEach, describe, expect, it } from 'vitest';
import { buildPayBillingSuccessUrl, getPayBillingUrl } from './pay-app-url';

const originalPayAppUrl = process.env.PAY_APP_URL;

afterEach(() => {
  process.env.PAY_APP_URL = originalPayAppUrl;
});

describe('Pay app URLs', () => {
  it('builds an encoded workspace billing URL', () => {
    process.env.PAY_APP_URL = 'https://pay.example.com';

    expect(getPayBillingUrl('workspace/one')).toBe(
      'https://pay.example.com/workspace%2Fone/billing'
    );
  });

  it('preserves all checkout success query parameters', () => {
    process.env.PAY_APP_URL = 'https://pay.example.com';

    expect(
      buildPayBillingSuccessUrl('workspace-1', {
        checkoutId: 'checkout-1',
        empty: '',
        repeated: ['one', 'two'],
        skipped: undefined,
      })
    ).toBe(
      'https://pay.example.com/workspace-1/billing/success?checkoutId=checkout-1&empty=&repeated=one&repeated=two'
    );
  });
});
