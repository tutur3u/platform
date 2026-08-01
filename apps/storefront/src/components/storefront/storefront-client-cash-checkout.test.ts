import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const clientSource = readFileSync(
  join(__dirname, 'storefront-client.tsx'),
  'utf8'
);
const fieldsSource = readFileSync(
  join(__dirname, 'cash-checkout-fields.tsx'),
  'utf8'
);
const hookSource = readFileSync(
  join(__dirname, 'use-storefront-cash-checkout.ts'),
  'utf8'
);
const orderSource = readFileSync(
  join(__dirname, 'storefront-order-screen.tsx'),
  'utf8'
);

describe('StorefrontClient cash checkout contract', () => {
  it('loads protected options and prefills Inventory Finance defaults', () => {
    expect(hookSource).toContain('getInventoryStaffCheckoutOptions');
    expect(hookSource).toContain("checkoutMethod === 'cash'");
    expect(hookSource).toContain('cash?.defaultWalletId');
    expect(hookSource).toContain('cash?.defaultCategoryId');
    expect(clientSource).toContain('categoryId: effectiveCashCategoryId');
    expect(clientSource).toContain('walletId: effectiveCashWalletId');
  });

  it('keeps cash Finance choices editable only in the staff fields', () => {
    expect(fieldsSource).toContain("methods.includes('cash')");
    expect(fieldsSource).toContain('onWalletChange');
    expect(fieldsSource).toContain('onCategoryChange');
    expect(fieldsSource).toContain("t('cashStaffProtection')");
  });

  it('renders authoritative recognized component totals on receipts', () => {
    expect(orderSource).toContain('line.recognizedRevenueAmount');
    expect(orderSource).not.toContain('line.subtotalAmount');
  });
});
