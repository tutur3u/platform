import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

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
  it('keeps the access token field inside the manage dialog', async () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/inventory/src/components/operator/polar-settings-panel.tsx'
      ),
      'utf8'
    );
    const dialogStart = source.indexOf('<DialogContent>');
    const tokenStart = source.indexOf('name="accessToken"');

    expect(dialogStart).toBeGreaterThan(-1);
    expect(tokenStart).toBeGreaterThan(dialogStart);
    expect(source.slice(0, dialogStart)).not.toContain('name="accessToken"');
    expect(source.slice(0, dialogStart)).not.toContain('tokenPlaceholder');
  });

  it('is only mounted from the settings dialog, not operator page bodies', () => {
    const operatorSource = readFileSync(
      join(
        process.cwd(),
        'apps/inventory/src/components/operator/inventory-operator-client.tsx'
      ),
      'utf8'
    );
    const settingsSource = readFileSync(
      join(
        process.cwd(),
        'apps/inventory/src/components/settings/settings-dialog.tsx'
      ),
      'utf8'
    );

    expect(operatorSource).not.toContain('<PolarSettingsPanel');
    expect(settingsSource).toContain('<PolarSettingsPanel');
  });
});
