import type {
  InventorySquareAppCredential,
  InventorySquareConnection,
  InventorySquareEnvironment,
} from '@tuturuuu/internal-api/inventory';

export type SquareSetupStepId =
  | 'application'
  | 'connection'
  | 'webhook'
  | 'location'
  | 'device';

export type SquareSetupProgressInput = {
  appCredential?: InventorySquareAppCredential;
  connection?: InventorySquareConnection;
  deviceId: string | null;
  environment: InventorySquareEnvironment;
  locationId: string | null;
  sandboxDeviceId: string | null;
};

export type SquareSetupStep = {
  complete: boolean;
  id: SquareSetupStepId;
};

export function getSquareSetupProgress({
  appCredential,
  connection,
  deviceId,
  environment,
  locationId,
  sandboxDeviceId,
}: SquareSetupProgressInput) {
  const steps: SquareSetupStep[] = [
    {
      complete: Boolean(
        (appCredential?.applicationId &&
          appCredential.applicationSecretLast4) ||
          (connection?.authMethod === 'manual' && connection.status === 'ready')
      ),
      id: 'application',
    },
    {
      complete: connection?.status === 'ready',
      id: 'connection',
    },
    {
      complete: Boolean(connection?.webhookSignatureKeyLast4),
      id: 'webhook',
    },
    { complete: Boolean(locationId), id: 'location' },
    {
      complete: Boolean(
        environment === 'sandbox' ? sandboxDeviceId || deviceId : deviceId
      ),
      id: 'device',
    },
  ];
  const completed = steps.filter((step) => step.complete).length;

  return {
    completed,
    firstIncompleteId: steps.find((step) => !step.complete)?.id ?? null,
    ready: completed === steps.length,
    steps,
    total: steps.length,
  };
}
