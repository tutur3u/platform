import { describe, expect, it } from 'vitest';
import { parseOfflineCreatePayload } from './offline-create-schema';

const id = '00005743-0000-4000-8000-000000000100';
const stock = {
  unit_id: id,
  warehouse_id: id,
  amount: 5,
  min_amount: 1,
  price: 123.125,
};
const product = { name: 'Synthetic', category_id: id, owner_id: id };

describe('offline product and finance schema boundaries', () => {
  it.each(['product', 'finance_category'] as const)(
    '%s trims names before applying length bounds',
    (kind) => {
      const payload = kind === 'product' ? product : { is_expense: false };
      expect(
        parseOfflineCreatePayload(kind, { ...payload, name: '   ' }).success
      ).toBe(false);
      expect(
        parseOfflineCreatePayload(kind, {
          ...payload,
          name: ` ${'x'.repeat(256)} `,
        }).success
      ).toBe(false);
      const parsed = parseOfflineCreatePayload(kind, {
        ...payload,
        name: ' Synthetic ',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.name).toBe('Synthetic');
    }
  );
  it.each(['amount', 'min_amount'] as const)(
    'rejects fractional %s while preserving fractional prices',
    (field) => {
      expect(
        parseOfflineCreatePayload('product', {
          ...product,
          inventory: [{ ...stock, [field]: 1.5 }],
        }).success
      ).toBe(false);
      const parsed = parseOfflineCreatePayload('product', {
        ...product,
        inventory: [stock],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success)
        expect(parsed.data).toMatchObject({ inventory: [{ price: 123.125 }] });
    }
  );
  it('permits 500 stock rows and rejects 501 before any RPC', () => {
    expect(
      parseOfflineCreatePayload('product', {
        ...product,
        inventory: Array(500).fill(stock),
      }).success
    ).toBe(true);
    expect(
      parseOfflineCreatePayload('product', {
        ...product,
        inventory: Array(501).fill(stock),
      }).success
    ).toBe(false);
  });
});
