import type {
  InventoryCheckoutSession,
  InventoryPolarSettings,
  InventorySquareCatalogSyncState,
  InventorySquareSettings,
} from '@tuturuuu/internal-api/inventory';

export type PaymentsNextStep =
  | 'connectSandbox'
  | 'importCatalog'
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
  const sandboxConnection = squareSettings?.connections.find(
    (connection) => connection.environment === 'sandbox'
  );
  if (sandboxConnection?.status !== 'ready') return 'connectSandbox';
  if ((squareSync?.links.length ?? 0) === 0) return 'importCatalog';
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
  const signals = [
    (polarSettings?.integrations ?? []).some(
      (integration) => integration.status === 'ready'
    ),
    squareSettings?.connections.some(
      (connection) =>
        connection.environment === 'sandbox' && connection.status === 'ready'
    ) ?? false,
    Boolean(squareSettings?.locationId),
    Boolean(squareSettings?.sandboxDeviceId || squareSettings?.deviceId),
    Boolean(
      squareSettings?.connections.some(
        (connection) => connection.webhookSignatureKeyLast4
      )
    ),
    (squareSync?.links.length ?? 0) > 0,
  ];
  return {
    completed: signals.filter(Boolean).length,
    percent: Math.round(
      (signals.filter(Boolean).length / signals.length) * 100
    ),
    total: signals.length,
  };
}
