import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = process.cwd().endsWith('/apps/inventory')
  ? process.cwd()
  : join(process.cwd(), 'apps/inventory');

describe('Payments route migration', () => {
  it('renders the provider control center at the first-class payments route', () => {
    const source = readFileSync(
      join(
        inventoryRoot,
        'src/app/[locale]/(dashboard)/[wsId]/payments/page.tsx'
      ),
      'utf8'
    );
    expect(source).toContain('<InventoryOperatorClient view="payments"');
  });

  it('preserves old bookmarks through a workspace-scoped redirect', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/app/[locale]/(dashboard)/[wsId]/polar/page.tsx'),
      'utf8'
    );
    expect(source).toMatch(/redirect\(`\/\$\{wsId\}\/payments`\)/u);
  });

  it('keeps provider changes read-only until the operator explicitly unlocks them', () => {
    const source = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-sync-observability-panel.tsx'
      ),
      'utf8'
    );
    expect(source).toContain('useState(false)');
    expect(source).toContain('setActionsEnabled((value) => !value)');
    expect(source).toContain('actionsEnabled={actionsEnabled}');
  });
});
