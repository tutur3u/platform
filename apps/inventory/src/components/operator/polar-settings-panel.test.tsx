import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const inventoryRoot = process.cwd().endsWith('/apps/inventory')
  ? process.cwd()
  : join(process.cwd(), 'apps/inventory');

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/inventory', () => ({
  getInventoryPolarSettings: vi.fn().mockResolvedValue({
    integrations: [],
    productionEnvironment: 'production',
    testingEnvironment: 'sandbox',
  }),
  updateInventoryPolarSettings: vi.fn(),
}));

describe('PolarSettingsPanel', () => {
  it('renders saved settings read-only until the compact edit control is used', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/polar-settings-panel.tsx'),
      'utf8'
    );

    expect(source).toContain(
      'const [isEditing, setIsEditing] = useState(false)'
    );
    expect(source).toContain("t('editSettings')");
    expect(source).toContain('<CompactEditButton');
    expect(source).toContain("t('readOnlyHint')");
    expect(source).toContain('{isEditing ? (');
  });

  it('keeps the access token field inside the manage dialog', async () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/polar-token-dialog.tsx'),
      'utf8'
    );
    const dialogStart = source.indexOf('OperatorDialogContent');
    const tokenStart = source.indexOf('tokenPlaceholder');

    expect(dialogStart).toBeGreaterThan(-1);
    expect(tokenStart).toBeGreaterThan(dialogStart);
    expect(source.slice(0, dialogStart)).not.toContain('tokenPlaceholder');
  });

  it('is consolidated under the shared payment settings surface', () => {
    const operatorSource = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/inventory-operator-client.tsx'
      ),
      'utf8'
    );
    const settingsSource = readFileSync(
      join(inventoryRoot, 'src/components/settings/settings-dialog.tsx'),
      'utf8'
    );
    const paymentSource = readFileSync(
      join(inventoryRoot, 'src/components/operator/payment-settings-panel.tsx'),
      'utf8'
    );

    expect(operatorSource).not.toContain('<PolarSettingsPanel');
    expect(settingsSource).toContain('<PaymentSettingsPanel');
    expect(paymentSource).toContain('<PolarSettingsPanel');
  });
});
