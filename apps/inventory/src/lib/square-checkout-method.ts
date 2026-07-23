import type { InventoryStorefrontCheckoutMode } from '@tuturuuu/internal-api/inventory';
import {
  getInventorySquareCheckoutRouting,
  getInventorySquareSettings,
} from '@tuturuuu/inventory-core/commerce/square';

type SquareCheckoutMode = Extract<
  InventoryStorefrontCheckoutMode,
  'square_pos' | 'square_terminal'
>;

export async function resolveSquareCheckoutMethod({
  configuredCheckoutMode,
  wsId,
}: {
  configuredCheckoutMode: SquareCheckoutMode;
  wsId: string;
}) {
  if (configuredCheckoutMode === 'square_pos') {
    return {
      checkoutMode: configuredCheckoutMode,
      fallbackApplied: false,
      terminalRouting: null,
    } as const;
  }

  const [terminalRouting, settings] = await Promise.all([
    getInventorySquareCheckoutRouting(wsId),
    getInventorySquareSettings(wsId),
  ]);
  const hasRoutableTerminal =
    terminalRouting.devices.length > 0 ||
    (terminalRouting.environment === 'sandbox' &&
      Boolean(terminalRouting.defaultDeviceId));

  if (!hasRoutableTerminal && settings.posReadiness.ready) {
    return {
      checkoutMode: 'square_pos',
      fallbackApplied: true,
      terminalRouting,
    } as const;
  }

  return {
    checkoutMode: configuredCheckoutMode,
    fallbackApplied: false,
    terminalRouting,
  } as const;
}
