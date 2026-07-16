import type {
  InventoryCheckoutSession,
  InventoryPolarSettings,
  InventorySquareCatalogSyncState,
  InventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';

export type PaymentsNextStep =
  | 'connectSandbox'
  | 'importCatalog'
  | 'importProductionCatalog'
  | 'pairProductionTerminal'
  | 'runTerminalTest'
  | 'prepareProduction'
  | 'monitor';

export function getPaymentsNextStep({
  checkouts,
  squareSettings,
  squareSync,
}: {
  checkouts: InventoryCheckoutSession[];
  squareSettings?: InventorySquareSettings;
  squareSync?: InventorySquareCatalogSyncState | null;
}): PaymentsNextStep {
  const activeEnvironment = squareSettings?.environment ?? 'sandbox';
  const activeLinks =
    squareSync?.environment === activeEnvironment ? squareSync.links : [];
  if (activeEnvironment === 'production') {
    const productionConnection = squareSettings?.connections.find(
      (connection) => connection.environment === 'production'
    );
    if (
      productionConnection?.status !== 'ready' ||
      !squareSettings?.locationId
    ) {
      return 'prepareProduction';
    }
    if (activeLinks.length === 0) return 'importProductionCatalog';
    if (squareSettings.readiness.issues.includes('device_missing')) {
      return 'pairProductionTerminal';
    }
    if (!squareSettings.readiness.ready) return 'prepareProduction';
    return 'monitor';
  }

  const sandboxConnection = squareSettings?.connections.find(
    (connection) => connection.environment === 'sandbox'
  );
  if (sandboxConnection?.status !== 'ready') return 'connectSandbox';
  if (activeLinks.length === 0) return 'importCatalog';
  if (!checkouts.some((checkout) => checkout.squareEnvironment === 'sandbox')) {
    return 'runTerminalTest';
  }
  const productionConnection = squareSettings?.connections.find(
    (connection) => connection.environment === 'production'
  );
  if (productionConnection?.status !== 'ready') return 'prepareProduction';
  return 'monitor';
}

export function getPaymentReadinessScore({
  polarSettings,
  squareSettings,
  squareSync,
}: {
  polarSettings?: InventoryPolarSettings;
  squareSettings?: InventorySquareSettings;
  squareSync?: InventorySquareCatalogSyncState | null;
}) {
  const activeEnvironment = squareSettings?.environment ?? 'sandbox';
  const activeConnection = squareSettings?.connections.find(
    (connection) => connection.environment === activeEnvironment
  );
  const activeLinks =
    squareSync?.environment === activeEnvironment ? squareSync.links : [];
  const signals = [
    (polarSettings?.integrations ?? []).some(
      (integration) => integration.status === 'ready'
    ),
    activeConnection?.status === 'ready',
    Boolean(squareSettings?.locationId),
    activeEnvironment === 'production'
      ? Boolean(squareSettings?.deviceId)
      : Boolean(squareSettings?.sandboxDeviceId),
    Boolean(activeConnection?.webhookSignatureKeyLast4),
    activeLinks.length > 0,
  ];
  return {
    completed: signals.filter(Boolean).length,
    percent: Math.round(
      (signals.filter(Boolean).length / signals.length) * 100
    ),
    total: signals.length,
  };
}
