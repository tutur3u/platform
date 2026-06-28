import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = process.cwd().endsWith('/apps/inventory')
  ? process.cwd()
  : join(process.cwd(), 'apps/inventory');

describe('SquareSettingsPanel', () => {
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

  it('is mounted from the settings dialog, not operator page bodies', () => {
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

    expect(operatorSource).not.toContain('<SquareSettingsPanel');
    expect(settingsSource).toContain('<SquareSettingsPanel');
  });
});
