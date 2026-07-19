import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = process.cwd().endsWith('/apps/inventory')
  ? process.cwd()
  : join(process.cwd(), 'apps/inventory');

describe('SquareSettingsPanel', () => {
  it('keeps provider settings read-only and opens changes in a dialog', () => {
    const source = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-panel.tsx'),
      'utf8'
    );
    const editorSource = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-settings-editor-dialog.tsx'
      ),
      'utf8'
    );

    expect(source).not.toContain('isEditing');
    expect(source).toContain('<SquareSettingsSummary');
    expect(source).toContain('<SquareSettingsEditorDialog');
    expect(source).toContain("t('editSettings')");
    expect(editorSource).toContain('<Dialog onOpenChange={closeDialog}');
    expect(editorSource).toContain('<OperatorDialogTabs');
    expect(editorSource).toContain("value: 'application'");
    expect(editorSource).toContain("value: 'connection'");
    expect(editorSource).toContain("value: 'terminal'");
  });

  it('saves workspace app credentials through the Square settings API payload', () => {
    const source = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-settings-editor-dialog.tsx'
      ),
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
      join(
        inventoryRoot,
        'src/components/operator/square-settings-editor-dialog.tsx'
      ),
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
      join(
        inventoryRoot,
        'src/components/operator/square-settings-editor-dialog.tsx'
      ),
      'utf8'
    );
    const cardsSource = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-cards.tsx'),
      'utf8'
    );

    expect(source).toContain('settings?.environment === environment');
    expect(source).toContain('environment,');
    expect(source).toContain("'square-locations', environment");
    expect(source).toContain("'square-devices', environment");
    expect(source).toContain('activeRoutingSettings?.locationId');
    expect(source).toContain('item.environment === environment');
    const panelSource = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-panel.tsx'),
      'utf8'
    );
    expect(panelSource).toContain('<SquareProductionSetupGuide');
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

  it('offers guarded pull, push, and non-destructive two-way sync in a dialog', () => {
    const source = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-catalog-sync-dialog.tsx'
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
    expect(observabilitySource).toContain('dialogOpen={syncDialogOpen}');
    expect(observabilitySource).not.toContain('<CompactEditButton');
    expect(source).toContain("'from_square'");
    expect(source).toContain("'to_square'");
    expect(source).toContain("'bidirectional'");
    expect(source).toContain('<OperatorDialogTabs');
    expect(source).toContain('<Accordion');
    expect(source).toContain("t('safetyDescription')");
    expect(source).toContain('onSettled: () =>');
  });

  it('guides every incomplete setup step into the matching settings tab', () => {
    const panelSource = readFileSync(
      join(inventoryRoot, 'src/components/operator/square-settings-panel.tsx'),
      'utf8'
    );
    const guideSource = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-production-setup-guide.tsx'
      ),
      'utf8'
    );

    expect(panelSource).toContain('EDITOR_TAB_BY_STEP');
    expect(panelSource).toContain('onConfigureStep={openEditor}');
    expect(guideSource).toContain('onConfigureStep(step.id)');
    expect(guideSource).toContain("t('configureStep')");
  });

  it('guides terminal pairing from an empty device list to a saved default', () => {
    const editorSource = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-settings-editor-dialog.tsx'
      ),
      'utf8'
    );
    const terminalSource = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-terminal-settings-card.tsx'
      ),
      'utf8'
    ).concat(
      readFileSync(
        join(
          inventoryRoot,
          'src/components/operator/square-terminal-production-setup.tsx'
        ),
        'utf8'
      )
    );

    expect(editorSource).toContain('lastDeviceCode');
    expect(editorSource).toContain(
      'onRefreshDevices={() => devices.refetch()}'
    );
    expect(editorSource).toContain('environment={environment}');
    expect(terminalSource).toContain("environment === 'production'");
    expect(terminalSource).toContain("t('terminalSteps.name.title')");
    expect(terminalSource).toContain("t('terminalSteps.enterCode.title')");
    expect(terminalSource).toContain("t('terminalSteps.select.title')");
    expect(terminalSource).toContain("t('terminalEmpty.title')");
    expect(terminalSource).toContain('lastDeviceCode.pairBy');
    expect(terminalSource).toContain('onRefreshDevices');
  });

  it('separates Terminal API hardware from phones using Square Reader', () => {
    const terminalSource = readFileSync(
      join(
        inventoryRoot,
        'src/components/operator/square-terminal-production-setup.tsx'
      ),
      'utf8'
    ).concat(
      readFileSync(
        join(
          inventoryRoot,
          'src/components/operator/square-reader-production-setup.tsx'
        ),
        'utf8'
      )
    );

    expect(terminalSource).toContain(
      "type SquareHardware = 'reader' | 'terminal'"
    );
    expect(terminalSource).toContain('useState<SquareHardware | null>');
    expect(terminalSource).toContain("hardware === 'terminal'");
    expect(terminalSource).toContain("hardware === 'reader'");
    expect(terminalSource).toContain("t('hardware.reader.title')");
    expect(terminalSource).toContain("t('readerSetup.title')");
    expect(terminalSource).toContain('posCallbackUrl');
    expect(terminalSource).toContain('posReady');
    expect(terminalSource).toContain("t('readerSetup.callback.title')");
    expect(terminalSource).toContain("t('readerSetup.storefront.title')");
    expect(terminalSource).toContain(
      'https://developer.squareup.com/docs/pos-api/build-mobile-web'
    );
  });
});
