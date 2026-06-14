import type {
  InventoryCheckoutResponse,
  InventoryCheckoutSession,
  InventoryPublicStorefrontResponse,
} from '@tuturuuu/internal-api/inventory';
import type { z } from 'zod';
import type { checkoutCreatePayloadSchema } from './schemas';

type CheckoutPayload = z.infer<typeof checkoutCreatePayloadSchema> & {
  customerAuthUid?: string | null;
};

type SimulatedCheckoutOptions = {
  payload: CheckoutPayload;
  storeSlug: string;
  storefrontPayload: InventoryPublicStorefrontResponse;
};

const SIMULATED_ORDER_PREFIX = 'simulated-order-';

export function isSimulatedOrderToken(publicToken: string) {
  return publicToken.startsWith(SIMULATED_ORDER_PREFIX);
}

function getLinePrice(
  line: CheckoutPayload['lines'][number],
  storefrontPayload: InventoryPublicStorefrontResponse
) {
  const listing = line.listingId
    ? storefrontPayload.listings.find((item) => item.id === line.listingId)
    : null;
  const bundle = line.bundleId
    ? storefrontPayload.bundles.find((item) => item.id === line.bundleId)
    : null;

  return {
    productId: listing?.productId ?? bundle?.id ?? line.bundleId ?? '',
    subtotal: (listing?.price ?? bundle?.price ?? 0) * line.quantity,
    title: listing?.title ?? bundle?.name ?? 'Simulated item',
    unitId: listing?.unitId ?? '',
    unitPrice: listing?.price ?? bundle?.price ?? 0,
    warehouseId: listing?.warehouseId ?? '',
  };
}

export function createSimulatedCheckoutResponse({
  payload,
  storeSlug,
  storefrontPayload,
}: SimulatedCheckoutOptions): InventoryCheckoutResponse {
  const now = new Date();
  const publicToken = `${SIMULATED_ORDER_PREFIX}${now.getTime().toString(36)}`;
  const lines = payload.lines.map((line, index) => {
    const priced = getLinePrice(line, storefrontPayload);

    return {
      bundleId: line.bundleId ?? null,
      checkoutSessionId: publicToken,
      id: `${publicToken}_${index}`,
      listingId: line.listingId ?? null,
      productId: priced.productId,
      quantity: line.quantity,
      subtotalAmount: priced.subtotal,
      title: priced.title,
      unitId: priced.unitId,
      unitPrice: priced.unitPrice,
      warehouseId: priced.warehouseId,
    };
  });
  const subtotalAmount = lines.reduce(
    (total, line) => total + line.subtotalAmount,
    0
  );
  const checkout: InventoryCheckoutSession = {
    completedAt: now.toISOString(),
    conversionFeeEstimateAmount: 0,
    currency: storefrontPayload.storefront.currency,
    customerAuthUid: payload.customerAuthUid ?? null,
    customerEmail: payload.customerEmail ?? 'simulated@example.com',
    customerName: payload.customerName ?? 'Simulated buyer',
    customerPhone: payload.customerPhone ?? null,
    expiresAt: null,
    financeInvoiceId: null,
    id: publicToken,
    lines,
    note: payload.note ?? null,
    platformFeeAmount: 0,
    polarCheckoutId: null,
    polarCheckoutUrl: null,
    polarEnvironment: null,
    polarOrderId: null,
    polarProductId: null,
    polarStatus: null,
    processingFeeEstimateAmount: 0,
    publicToken,
    status: 'completed',
    subtotalAmount,
    totalAmount: subtotalAmount,
    wsId: storefrontPayload.storefront.wsId,
  };

  return {
    checkout,
    checkoutUrl: `/${storeSlug}/orders/${publicToken}`,
  };
}

export function getSimulatedOrderResponse(publicToken: string): {
  order: InventoryCheckoutSession;
} {
  return {
    order: {
      completedAt: new Date().toISOString(),
      conversionFeeEstimateAmount: 0,
      currency: 'USD',
      customerAuthUid: null,
      customerEmail: 'simulated@example.com',
      customerName: 'Simulated buyer',
      customerPhone: null,
      expiresAt: null,
      financeInvoiceId: null,
      id: publicToken,
      lines: [],
      note: null,
      platformFeeAmount: 0,
      polarCheckoutId: null,
      polarCheckoutUrl: null,
      polarEnvironment: null,
      polarOrderId: null,
      polarProductId: null,
      polarStatus: null,
      processingFeeEstimateAmount: 0,
      publicToken,
      status: 'completed',
      subtotalAmount: 0,
      totalAmount: 0,
      wsId: 'simulated',
    },
  };
}
