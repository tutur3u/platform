import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = process.cwd().endsWith('/apps/inventory')
  ? process.cwd()
  : join(process.cwd(), 'apps/inventory');

describe('PaymentSettingsPanel', () => {
  it('uses high-contrast provider status badges', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/payment-settings-panel.tsx'),
      'utf8'
    );

    expect(source).toContain('text-dynamic-green');
    expect(source).toContain('text-dynamic-orange');
    expect(source).not.toContain(
      'className="ml-auto shrink-0 bg-background/80"'
    );
  });

  it('does not register a missing service worker in Inventory', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/app/[locale]/layout.tsx'),
      'utf8'
    );

    expect(source).toContain('<SerwistProvider register={false}>');
  });
});
