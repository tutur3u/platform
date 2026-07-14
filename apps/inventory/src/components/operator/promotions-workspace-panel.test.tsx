import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = process.cwd().endsWith('/apps/inventory')
  ? process.cwd()
  : join(process.cwd(), 'apps/inventory');

describe('PromotionsWorkspacePanel', () => {
  it('owns promotion management and referral configuration outside Commerce', () => {
    const source = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/promotions-workspace-panel.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('<PromotionRows');
    expect(source).toContain('<ReferralProgramPanel');
    expect(source).toContain("value: 'campaigns'");
    expect(source).toContain("value: 'referrals'");
  });

  it('removes the duplicate Promotions tab and query branch from Commerce', () => {
    const commerce = readFileSync(
      join(inventoryRoot, 'src/components/operator/commerce-panel.tsx'),
      'utf8'
    );
    const data = readFileSync(
      join(inventoryRoot, 'src/components/operator/use-inventory-data.ts'),
      'utf8'
    );

    expect(commerce).not.toContain("value: 'promotions'");
    expect(commerce).not.toContain('<PromotionRows');
    expect(data).not.toContain("commerceTab === 'promotions'");
  });
});
