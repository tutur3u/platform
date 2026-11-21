import { describe, expect, it } from 'vitest';
import { parseInventoryCostingCsv } from './costing-csv';

describe('parseInventoryCostingCsv', () => {
  it('parses Google Sheets merch cost CSV rows', () => {
    const csv = `Item Category,Batch Size (Units),Mfg cost/Unit,Total cost/Unit,Target Retail Price,Talent Profit Per Sale,Veizo Profit Per Sale
Acrylic Keychain,30,$0.70,$1.37,$10.00,$6.04,$2.59
,50,$0.65,$1.05,$10.00,$6.27,$2.69`;

    const preview = parseInventoryCostingCsv(csv);

    expect(preview.warnings).toEqual([]);
    expect(preview.rows).toEqual([
      {
        artCommissionCost: null,
        batchSize: 30,
        itemCategory: 'Acrylic Keychain',
        manufacturingCostPerUnit: 0.7,
        packagingCostPerUnit: null,
        partnerProfitPerSale: 2.59,
        shippingCost: null,
        talentProfitPerSale: 6.04,
        targetRetailPrice: 10,
        tariffCost: null,
        totalCostPerUnit: 1.37,
      },
      {
        artCommissionCost: null,
        batchSize: 50,
        itemCategory: 'Acrylic Keychain',
        manufacturingCostPerUnit: 0.65,
        packagingCostPerUnit: null,
        partnerProfitPerSale: 2.69,
        shippingCost: null,
        talentProfitPerSale: 6.27,
        targetRetailPrice: 10,
        tariffCost: null,
        totalCostPerUnit: 1.05,
      },
    ]);
  });

  it('parses optional art-commission and shipping columns for break-even', () => {
    const csv = `Item Category,Batch Size (Units),Mfg cost/Unit,Total cost/Unit,Target Retail Price,Art Commission,Shipping
Acrylic Keychain,30,$0.70,$1.37,$10.00,$40.00,$20.00`;

    const [row] = parseInventoryCostingCsv(csv).rows;

    expect(row?.artCommissionCost).toBe(40);
    expect(row?.shippingCost).toBe(20);
  });

  it('returns warnings when no importable rows are found', () => {
    const preview = parseInventoryCostingCsv(
      'Item Category,Batch Size (Units),Mfg cost/Unit,Total cost/Unit,Target Retail Price\n,,,,'
    );

    expect(preview.rows).toEqual([]);
    expect(preview.warnings).toContain(
      'No importable costing rows were found.'
    );
  });
});
