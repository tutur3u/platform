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
        batchSize: 30,
        itemCategory: 'Acrylic Keychain',
        manufacturingCostPerUnit: 0.7,
        partnerProfitPerSale: 2.59,
        talentProfitPerSale: 6.04,
        targetRetailPrice: 10,
        totalCostPerUnit: 1.37,
      },
      {
        batchSize: 50,
        itemCategory: 'Acrylic Keychain',
        manufacturingCostPerUnit: 0.65,
        partnerProfitPerSale: 2.69,
        talentProfitPerSale: 6.27,
        targetRetailPrice: 10,
        totalCostPerUnit: 1.05,
      },
    ]);
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
