import { z } from 'zod';

const boundedId = z.string().min(1).max(256);
const opaqueToken = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[^\x00-\x1f\x7f]+$/);
const subscriptionSchema = z.object({
  kind: z.literal('androidpublisher#subscriptionPurchaseV2'),
  subscriptionState: z.enum([
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_CANCELED',
    'SUBSCRIPTION_STATE_EXPIRED',
    'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
  ]),
  acknowledgementState: z.enum([
    'ACKNOWLEDGEMENT_STATE_PENDING',
    'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  ]),
  externalAccountIdentifiers: z.object({
    obfuscatedExternalAccountId: boundedId,
  }),
  linkedPurchaseToken: opaqueToken.optional(),
  testPurchase: z.object({}).optional(),
  lineItems: z
    .array(
      z.object({
        productId: boundedId,
        expiryTime: z.string().datetime({ offset: true }),
        offerDetails: z.object({ basePlanId: boundedId }),
        autoRenewingPlan: z
          .object({ autoRenewEnabled: z.boolean() })
          .optional(),
      })
    )
    .min(1)
    .max(10),
});

export type PlaySubscriptionState = z.infer<
  typeof subscriptionSchema
>['subscriptionState'];
export type PlayProductBinding = Readonly<{
  productId: string;
  basePlanId: string;
  profile: 'plus' | 'pro' | 'max' | 'ultra' | 'ultimate';
}>;
export type PlayVerifierConfig = Readonly<{
  packageName: string;
  environment: 'production' | 'test';
  products: readonly [PlayProductBinding, ...PlayProductBinding[]];
}>;
export type VerifiedPlaySubscription = Readonly<{
  packageName: string;
  environment: 'production' | 'test';
  purchaseToken: string;
  linkedPurchaseToken: string | null;
  actorId: string;
  accountId: string;
  productId: string;
  basePlanId: string;
  profile: PlayProductBinding['profile'];
  state: PlaySubscriptionState;
  expiresAt: number;
  access: 'active' | 'inactive';
  acknowledgement: 'pending' | 'acknowledged';
}>;
export type PlayVerificationResult =
  | { kind: 'verified'; subscription: VerifiedPlaySubscription }
  | {
      kind: 'rejected';
      category: 'invalid_input' | 'identity_mismatch' | 'unavailable';
    };

export interface PlayApiTransport {
  // Server credential custody belongs to this boundary, never purchase input.
  accessToken(signal: AbortSignal): Promise<string>;
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export async function readPlayBoundedJson(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<unknown> {
  if (!body) throw new Error('Missing body');
  const reader = body.getReader();
  const deadline = AbortSignal.timeout(10_000);
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  deadline.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (deadline.aborted) throw new Error('Body deadline exceeded');
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('Body too large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    deadline.removeEventListener('abort', abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createPlayServerVerifier(
  config: PlayVerifierConfig,
  transport: PlayApiTransport,
  now: () => number = Date.now
) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(config.packageName)) {
    throw new Error('Invalid Play package');
  }
  const bindings = new Map<string, PlayProductBinding>();
  for (const binding of config.products) {
    const key = `${binding.productId}/${binding.basePlanId}`;
    if (
      !boundedId.safeParse(binding.productId).success ||
      !boundedId.safeParse(binding.basePlanId).success ||
      bindings.has(key)
    ) {
      throw new Error('Invalid Play product catalog');
    }
    bindings.set(key, binding);
  }

  return {
    async verify(request: {
      purchaseToken: string;
      actorId: string;
      expectedAccountId: string;
    }): Promise<PlayVerificationResult> {
      if (
        !opaqueToken.safeParse(request.purchaseToken).success ||
        !z.string().uuid().safeParse(request.actorId).success ||
        !boundedId.safeParse(request.expectedAccountId).success
      ) {
        return { kind: 'rejected', category: 'invalid_input' };
      }
      try {
        const signal = AbortSignal.timeout(10_000);
        const bearer = await transport.accessToken(signal);
        if (!bearer || /[\r\n]/.test(bearer))
          throw new Error('Credential unavailable');
        const response = await transport.fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(request.purchaseToken)}`,
          {
            method: 'GET',
            headers: { authorization: `Bearer ${bearer}` },
            signal,
          }
        );
        if (
          !response.ok ||
          !response.headers
            .get('content-type')
            ?.toLowerCase()
            .startsWith('application/json')
        ) {
          await response.body?.cancel();
          throw new Error('Play unavailable');
        }
        const parsed = subscriptionSchema.safeParse(
          await readPlayBoundedJson(response.body, 64 * 1024)
        );
        if (!parsed.success)
          return { kind: 'rejected', category: 'invalid_input' };
        const value = parsed.data;
        if (
          value.externalAccountIdentifiers.obfuscatedExternalAccountId !==
            request.expectedAccountId ||
          (value.testPurchase !== undefined) !== (config.environment === 'test')
        ) {
          return { kind: 'rejected', category: 'identity_mismatch' };
        }
        // Auto-renewing single-product subscriptions only; multi-item/prepaid
        // plans require a separately reviewed projection instead of guessing.
        if (value.lineItems.length !== 1)
          return { kind: 'rejected', category: 'invalid_input' };
        const item = value.lineItems[0];
        if (!item || !item.autoRenewingPlan)
          return { kind: 'rejected', category: 'invalid_input' };
        const binding = bindings.get(
          `${item.productId}/${item.offerDetails.basePlanId}`
        );
        if (!binding)
          return { kind: 'rejected', category: 'identity_mismatch' };
        const expiresAt = Date.parse(item.expiryTime);
        const stateAllowsAccess =
          value.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' ||
          value.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ||
          value.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED';
        return {
          kind: 'verified',
          subscription: {
            packageName: config.packageName,
            environment: config.environment,
            purchaseToken: request.purchaseToken,
            linkedPurchaseToken: value.linkedPurchaseToken ?? null,
            actorId: request.actorId,
            accountId: request.expectedAccountId,
            productId: item.productId,
            basePlanId: item.offerDetails.basePlanId,
            profile: binding.profile,
            state: value.subscriptionState,
            expiresAt,
            access:
              stateAllowsAccess && expiresAt > now() ? 'active' : 'inactive',
            acknowledgement:
              value.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'
                ? 'pending'
                : 'acknowledged',
          },
        };
      } catch {
        return { kind: 'rejected', category: 'unavailable' };
      }
    },

    // The caller must first durably apply the verified entitlement transaction.
    async acknowledgeCommitted(
      subscription: VerifiedPlaySubscription
    ): Promise<boolean> {
      if (subscription.acknowledgement === 'acknowledged') return true;
      if (
        subscription.packageName !== config.packageName ||
        subscription.environment !== config.environment ||
        subscription.access !== 'active' ||
        !bindings.has(`${subscription.productId}/${subscription.basePlanId}`)
      )
        return false;
      try {
        const signal = AbortSignal.timeout(10_000);
        const bearer = await transport.accessToken(signal);
        if (!bearer || /[\r\n]/.test(bearer)) return false;
        const response = await transport.fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}/purchases/subscriptions/${encodeURIComponent(subscription.productId)}/tokens/${encodeURIComponent(subscription.purchaseToken)}:acknowledge`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${bearer}`,
              'content-type': 'application/json',
            },
            body: '{}',
            signal,
          }
        );
        await response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
