import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = process.cwd().endsWith('/apps/inventory')
  ? process.cwd()
  : join(process.cwd(), 'apps/inventory');

describe('SquareSettingsPanel', () => {
  it('keeps provider settings read-only until the compact edit control is used', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-panel.tsx'),
      'utf8'
    );

    expect(source).toContain(
      'const [isEditing, setIsEditing] = useState(false)'
    );
    expect(source).toContain('<SquareSettingsSummary');
    expect(source).toContain("t('editSettings')");
  });

  it('saves workspace app credentials through the Square settings API payload', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-panel.tsx'),
      'utf8'
    );

    expect(source).toContain('applicationId: applicationId || undefined');
    expect(source).toContain(
      'applicationSecret: applicationSecret || undefined'
    );
    expect(source).toContain('oauthRedirectUrl: oauthRedirectUrl || undefined');
    expect(source).toContain(
      'webhookNotificationUrl: webhookNotificationUrl || undefined'
    );
  });

  it('gates OAuth start on saved app credential metadata', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-panel.tsx'),
      'utf8'
    );
    const cardsSource = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-cards.tsx'),
      'utf8'
    );

    expect(source).toContain('activeAppCredential?.applicationId');
    expect(source).toContain('activeAppCredential.applicationSecretLast4');
    expect(cardsSource).toContain('disabled={oauthPending || !oauthReady}');
  });

  it('uses the environment selected in the form for connection state and defaults', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-panel.tsx'),
      'utf8'
    );
    const cardsSource = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-cards.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "environment ?? settings.data?.environment ?? 'sandbox'"
    );
    expect(source).toContain('environment: selectedEnvironment');
    expect(source).toContain("'square-locations', selectedEnvironment");
    expect(source).toContain("'square-devices', selectedEnvironment");
    expect(source).toContain('activeRoutingSettings?.locationId');
    expect(source).toContain('item.environment === selectedEnvironment');
    expect(source).toContain('<SquareProductionSetupGuide');
    expect(cardsSource).toContain(
      "tokenLast4\n    ? readinessIssues.join(', ') || t('ready')\n    : t('notConfigured')"
    );
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

    expect(operatorSource).not.toContain('<SquareSettingsPanel');
    expect(settingsSource).toContain('<PaymentSettingsPanel');
    expect(paymentSource).toContain('<SquareSettingsPanel');
  });

  it('offers guarded pull, push, and non-destructive two-way catalog sync', () => {
    const source = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-catalog-sync-card.tsx'
      ),
      'utf8'
    );
    const observabilitySource = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-sync-observability-panel.tsx'
      ),
      'utf8'
    );

    expect(observabilitySource).toContain('<SquareCatalogSyncCard');
    expect(observabilitySource).toContain('actionsEnabled={actionsEnabled}');
    expect(observabilitySource).toContain('<CompactEditButton');
    expect(source).toContain("'from_square'");
    expect(source).toContain("'to_square'");
    expect(source).toContain("'bidirectional'");
    expect(source).toContain('<AlertDialog');
    expect(source).toContain("t('safetyDescription')");
    expect(source).toContain('onSettled: () =>');
    expect(source).toContain("t('lastError'");
  });
});
