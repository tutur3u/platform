import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  InventoryBundleCategoryCandidate,
  InventoryBundleCategoryComponent,
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
const SIMULATED_ORDER_TOKEN_TYPE = 'inventory_simulated_order';
const SIMULATED_ORDER_TOKEN_VERSION = 1;
const SIMULATED_ORDER_TTL_SECONDS = 24 * 60 * 60;
const LOCAL_DEVELOPMENT_SECRET =
  'tuturuuu-local-development-inventory-simulated-order-secret';

type SimulatedOrderTokenClaims = {
  currency: string;
  customerEmail: string;
  customerName: string;
  exp: number;
  iat: number;
  jti: string;
  storeSlug: string;
  subtotalAmount: number;
  totalAmount: number;
  typ: typeof SIMULATED_ORDER_TOKEN_TYPE;
  v: typeof SIMULATED_ORDER_TOKEN_VERSION;
  wsId: string;
};

type SimulatedOrderTokenOptions = {
  now?: Date;
  secret?: string;
};

function getSecretCandidates(explicitSecret?: string) {
  const candidates = explicitSecret
    ? [explicitSecret]
    : [
        process.env.INVENTORY_SIMULATED_ORDER_SECRET,
        process.env.TUTURUUU_APP_COORDINATION_SECRET,
        process.env.SUPABASE_SECRET_KEY,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        process.env.SUPABASE_SERVICE_KEY,
      ];

  const secrets = candidates
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0 && process.env.NODE_ENV !== 'production') {
    return [LOCAL_DEVELOPMENT_SECRET];
  }

  if (secrets.length === 0) {
    throw new Error(
      'Missing INVENTORY_SIMULATED_ORDER_SECRET or Supabase service secret'
    );
  }

  return [...new Set(secrets)];
}

function getSigningSecret(explicitSecret?: string) {
  return getSecretCandidates(explicitSecret)[0]!;
}

function getVerificationSecrets(explicitSecret?: string) {
  return getSecretCandidates(explicitSecret);
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signContent(content: string, secret: string) {
  return createHmac('sha256', secret).update(content).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isSimulatedOrderTokenClaims(
  value: unknown
): value is SimulatedOrderTokenClaims {
  if (!value || typeof value !== 'object') return false;

  const claims = value as Partial<SimulatedOrderTokenClaims>;

  return (
    claims.typ === SIMULATED_ORDER_TOKEN_TYPE &&
    claims.v === SIMULATED_ORDER_TOKEN_VERSION &&
    typeof claims.currency === 'string' &&
    typeof claims.customerEmail === 'string' &&
    typeof claims.customerName === 'string' &&
    typeof claims.storeSlug === 'string' &&
    typeof claims.wsId === 'string' &&
    typeof claims.jti === 'string' &&
    typeof claims.iat === 'number' &&
    typeof claims.exp === 'number' &&
    typeof claims.subtotalAmount === 'number' &&
    typeof claims.totalAmount === 'number'
  );
}

export function isSimulatedOrderToken(publicToken: string) {
  return publicToken.startsWith(SIMULATED_ORDER_PREFIX);
}

export function createSimulatedOrderToken(
  payload: Omit<SimulatedOrderTokenClaims, 'exp' | 'iat' | 'jti' | 'typ' | 'v'>,
  options: SimulatedOrderTokenOptions = {}
) {
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const claims: SimulatedOrderTokenClaims = {
    ...payload,
    exp: nowSeconds + SIMULATED_ORDER_TTL_SECONDS,
    iat: nowSeconds,
    jti: randomUUID(),
    typ: SIMULATED_ORDER_TOKEN_TYPE,
    v: SIMULATED_ORDER_TOKEN_VERSION,
  };
  const encodedClaims = encodeBase64Url(JSON.stringify(claims));
  const signature = signContent(
    encodedClaims,
    getSigningSecret(options.secret)
  );

  return `${SIMULATED_ORDER_PREFIX}${encodedClaims}.${signature}`;
}

export function verifySimulatedOrderToken(
  publicToken: string,
  options: SimulatedOrderTokenOptions = {}
):
  | {
      claims: SimulatedOrderTokenClaims;
      ok: true;
    }
  | { error: string; ok: false } {
  if (!isSimulatedOrderToken(publicToken)) {
    return { error: 'not_simulated_order', ok: false };
  }

  const token = publicToken.slice(SIMULATED_ORDER_PREFIX.length);
  const [encodedClaims, signature, ...extra] = token.split('.');

  if (extra.length > 0 || !encodedClaims || !signature) {
    return { error: 'malformed_token', ok: false };
  }

  const validSignature = getVerificationSecrets(options.secret).some((secret) =>
    safeEqual(signature, signContent(encodedClaims, secret))
  );

  if (!validSignature) {
    return { error: 'invalid_signature', ok: false };
  }

  const claims = safeJsonParse(decodeBase64Url(encodedClaims));

  if (!isSimulatedOrderTokenClaims(claims)) {
    return { error: 'invalid_claims', ok: false };
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (claims.exp <= nowSeconds) {
    return { error: 'expired_token', ok: false };
  }

  return { claims, ok: true };
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

  if (bundle?.categoryComponents?.length && line.bundleSelections) {
    return getCategoryBundleLinePrice(line, bundle, storefrontPayload);
  }

  const variant = listing?.variants?.find((item) => item.id === line.variantId);

  return {
    productId: listing?.productId ?? bundle?.id ?? line.bundleId ?? '',
    subtotal:
      (variant?.price ?? listing?.price ?? bundle?.price ?? 0) * line.quantity,
    title: variant?.title ?? listing?.title ?? bundle?.name ?? 'Simulated item',
    unitId: listing?.unitId ?? '',
    unitPrice: variant?.price ?? listing?.price ?? bundle?.price ?? 0,
    warehouseId: listing?.warehouseId ?? '',
  };
}

function getComponentSelectionItems(
  line: CheckoutPayload['lines'][number],
  component: InventoryBundleCategoryComponent
) {
  const selections = line.bundleSelections;
  if (!selections) return [];

  if (Array.isArray(selections)) {
    return (
      selections.find((selection) => selection.componentId === component.id)
        ?.items ?? []
    );
  }

  return selections[component.id] ?? [];
}

function resolveCandidate(
  component: InventoryBundleCategoryComponent,
  item: ReturnType<typeof getComponentSelectionItems>[number]
) {
  return component.candidates?.find((candidate) => {
    if (item.variantId) {
      return (
        candidate.variantId === item.variantId &&
        candidate.listingId === item.listingId
      );
    }
    if (item.listingId) {
      return candidate.listingId === item.listingId && !candidate.variantId;
    }
    return (
      candidate.productId === item.productId &&
      candidate.unitId === item.unitId &&
      candidate.warehouseId === item.warehouseId
    );
  });
}

function getCategoryBundleLinePrice(
  line: CheckoutPayload['lines'][number],
  bundle: InventoryPublicStorefrontResponse['bundles'][number],
  storefrontPayload: InventoryPublicStorefrontResponse
) {
  const selectedCandidates: Array<{
    candidate: InventoryBundleCategoryCandidate;
    quantity: number;
  }> = [];

  let subtotal = 0;
  for (const component of bundle.categoryComponents) {
    const items = getComponentSelectionItems(line, component);
    const selectedQuantity = items.reduce(
      (total, item) => total + (item.quantity ?? 1),
      0
    );

    if (selectedQuantity !== component.quantityRequired) {
      throw new Error('Invalid bundle selection quantity');
    }

    const pricedItems = items.map((item) => {
      const candidate = resolveCandidate(component, item);
      if (!candidate) throw new Error('Invalid bundle selection item');
      return {
        candidate,
        quantity: item.quantity ?? 1,
      };
    });

    selectedCandidates.push(...pricedItems);

    let freeRemaining =
      component.discountStrategy === 'cheapest_free'
        ? component.freeQuantity * line.quantity
        : 0;

    for (const pricedItem of pricedItems.sort(
      (a, b) => a.candidate.price - b.candidate.price
    )) {
      const totalUnits = pricedItem.quantity * line.quantity;
      const freeUnits = Math.min(totalUnits, freeRemaining);
      freeRemaining -= freeUnits;
      subtotal += (totalUnits - freeUnits) * pricedItem.candidate.price;
    }
  }

  const firstSelection = selectedCandidates[0]?.candidate;

  return {
    productId: firstSelection?.productId ?? bundle.id,
    subtotal,
    title: bundle.name,
    unitId: firstSelection?.unitId ?? '',
    unitPrice: Math.round(subtotal / Math.max(1, line.quantity)),
    warehouseId: firstSelection?.warehouseId ?? storefrontPayload.storefront.id,
  };
}

export function createSimulatedCheckoutResponse({
  payload,
  storeSlug,
  storefrontPayload,
}: SimulatedCheckoutOptions): InventoryCheckoutResponse {
  const now = new Date();
  const pricedLines = payload.lines.map((line) => {
    return {
      line,
      priced: getLinePrice(line, storefrontPayload),
    };
  });
  const subtotalAmount = pricedLines.reduce(
    (total, item) => total + item.priced.subtotal,
    0
  );
  const customerEmail = payload.customerEmail ?? 'simulated@example.com';
  const customerName = payload.customerName ?? 'Simulated buyer';
  const currency = storefrontPayload.storefront.currency;
  const publicToken = createSimulatedOrderToken({
    currency,
    customerEmail,
    customerName,
    storeSlug,
    subtotalAmount,
    totalAmount: subtotalAmount,
    wsId: storefrontPayload.storefront.wsId,
  });
  const lines = pricedLines.map(({ line, priced }, index) => {
    return {
      bundleId: line.bundleId ?? null,
      checkoutSessionId: publicToken,
      id: `${publicToken}_${index}`,
      listingId: line.listingId ?? null,
      variantId: line.variantId ?? null,
      productId: priced.productId,
      quantity: line.quantity,
      subtotalAmount: priced.subtotal,
      title: priced.title,
      unitId: priced.unitId,
      unitPrice: priced.unitPrice,
      warehouseId: priced.warehouseId,
    };
  });
  const checkout: InventoryCheckoutSession = {
    checkoutProvider: 'simulated',
    completedAt: now.toISOString(),
    conversionFeeEstimateAmount: 0,
    currency,
    customerAuthUid: payload.customerAuthUid ?? null,
    customerEmail,
    customerName,
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
    squareDeviceId: null,
    squareEnvironment: null,
    squareFailureReason: null,
    squareLastSyncedAt: null,
    squareLocationId: null,
    squareOrderId: null,
    squarePaymentId: null,
    squareReceiptUrl: null,
    squareStatus: null,
    squareTerminalCheckoutId: null,
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

export function getSimulatedOrderResponse(
  publicToken: string,
  options: SimulatedOrderTokenOptions = {}
): {
  order: InventoryCheckoutSession;
} | null {
  const verification = verifySimulatedOrderToken(publicToken, options);
  if (!verification.ok) return null;

  const { claims } = verification;

  return {
    order: {
      checkoutProvider: 'simulated',
      completedAt: new Date(claims.iat * 1000).toISOString(),
      conversionFeeEstimateAmount: 0,
      currency: claims.currency,
      customerAuthUid: null,
      customerEmail: claims.customerEmail,
      customerName: claims.customerName,
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
      squareDeviceId: null,
      squareEnvironment: null,
      squareFailureReason: null,
      squareLastSyncedAt: null,
      squareLocationId: null,
      squareOrderId: null,
      squarePaymentId: null,
      squareReceiptUrl: null,
      squareStatus: null,
      squareTerminalCheckoutId: null,
      status: 'completed',
      subtotalAmount: claims.subtotalAmount,
      totalAmount: claims.totalAmount,
      wsId: claims.wsId,
    },
  };
}
