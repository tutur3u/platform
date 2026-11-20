import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type LiveMintConfig, readLiveMintConfig } from './mint-cap';

/** Plans that include Live voice. */
export const LIVE_PAID_TIERS = ['PLUS', 'PRO', 'ENTERPRISE'] as const;

/** `private.begin_ai_live_session` refuses a reservation below this. */
export const LIVE_MIN_CREDITS = 500;

/**
 * Stable reasons a Live start is refused. Clients map these to copy; the
 * response never carries server text.
 */
export type LiveBlockReason =
  | 'plan_required'
  | 'credits_exhausted'
  | 'limit_reached'
  | 'role_not_allowed'
  | 'paused';

export interface LiveBillingWorkspace {
  wsId: string;
  name: string | null;
  personal: boolean;
}

export interface LiveEligibilityParams {
  plans: readonly string[];
  balance?: number;
  minimumCredits?: number;
  resetAt?: string;
}

export interface LiveEligibility {
  eligible: boolean;
  reason: LiveBlockReason | null;
  /** Free-tier admission rules apply (shared budget, flash model only). */
  isFree: boolean;
  tier: string;
  billing: LiveBillingWorkspace;
  params: LiveEligibilityParams;
}

/** The credits the Live reservation sees for the billed workspace. */
export interface LiveCreditSnapshot {
  /** Active, unexpired, positive pack credits (`_get_active_payg_credits`). */
  packCredits: number;
  /** Included balance of the row `get_or_create_credit_balance` returns. */
  includedRemaining: number;
}

/** `begin_ai_live_session` reserves at most this many credits. */
export const LIVE_MAX_RESERVATION = 2000;

/**
 * Mirrors `begin_ai_live_session`: it reserves
 * `least(2000, floor(included + packs))`, refuses below 500, and the fixed
 * reservation then takes that whole amount from the included balance. A
 * pre-check that passes here cannot be refused for credits at mint.
 */
export function liveReservationAdmits({
  includedRemaining,
  packCredits,
}: LiveCreditSnapshot) {
  const remaining = includedRemaining + packCredits;
  if (remaining <= 0) return false;
  const reserved = Math.min(LIVE_MAX_RESERVATION, Math.floor(remaining));
  return reserved >= LIVE_MIN_CREDITS && includedRemaining >= reserved;
}

export interface LiveEligibilityDeps {
  /** Authoritative tier; throws when it cannot be determined. */
  getTier: (wsId: string) => Promise<string>;
  /** Throws when the credit view cannot be read. */
  getCredits: (wsId: string, userId: string) => Promise<LiveCreditSnapshot>;
  getWorkspace: (
    wsId: string
  ) => Promise<{ name: string | null; personal: boolean } | null>;
  readConfig: () => LiveMintConfig;
}

async function admin(): Promise<TypedSupabaseClient> {
  return (await createAdminClient({
    noCookie: true,
  })) as unknown as TypedSupabaseClient;
}

class LiveEligibilityLookupError extends Error {
  constructor(what: string) {
    super(`Live eligibility lookup failed: ${what}`);
    this.name = 'LiveEligibilityLookupError';
  }
}

export const defaultLiveEligibilityDeps: LiveEligibilityDeps = {
  /**
   * Mirrors `_resolve_workspace_tier`: the newest `active` subscription's
   * product tier, else FREE. Unlike `getWorkspaceTier`, a failed read throws
   * instead of falling back to FREE.
   */
  async getTier(wsId) {
    const client = await admin();
    const { data: subscriptions, error } = await client
      .from('workspace_subscriptions')
      .select('product_id, created_at')
      .eq('ws_id', wsId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new LiveEligibilityLookupError('subscriptions');
    const subscription = subscriptions?.[0];
    if (!subscription) return 'FREE';
    // An active subscription without a product has no knowable tier.
    const productId = subscription.product_id;
    if (!productId)
      throw new LiveEligibilityLookupError('subscription product');
    const { data: product, error: productError } = await client
      .schema('private' as never)
      .from('workspace_subscription_products' as never)
      .select('tier')
      .eq('id', productId)
      .maybeSingle();
    const tier = (product as { tier?: string | null } | null)?.tier;
    if (productError || !tier) {
      throw new LiveEligibilityLookupError('subscription product');
    }
    return tier;
  },
  /**
   * Reads the exact balance row the reservation uses by calling the same
   * `get_or_create_credit_balance(ws, actor)`; it writes only when the
   * period's row does not exist yet, as the reservation would first.
   */
  async getCredits(wsId, userId) {
    const client = await admin();
    const [packs, balance] = await Promise.all([
      client
        .from('workspace_credit_pack_purchases')
        .select('tokens_remaining')
        .eq('ws_id', wsId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .gt('tokens_remaining', 0),
      client.rpc('get_or_create_credit_balance', {
        p_ws_id: wsId,
        p_user_id: userId,
      }),
    ]);
    if (packs.error) throw new LiveEligibilityLookupError('credit packs');
    const row = (
      balance.data as
        | {
            total_allocated: number | null;
            total_used: number | null;
            bonus_credits: number | null;
          }[]
        | null
    )?.[0];
    if (balance.error || !row) {
      throw new LiveEligibilityLookupError('credit balance');
    }
    return {
      packCredits: (packs.data ?? []).reduce(
        (sum, pack) => sum + Number(pack.tokens_remaining ?? 0),
        0
      ),
      includedRemaining:
        Number(row.total_allocated ?? 0) +
        Number(row.bonus_credits ?? 0) -
        Number(row.total_used ?? 0),
    };
  },
  async getWorkspace(wsId) {
    const { data, error } = await (
      await admin()
    )
      .from('workspaces')
      .select('name, personal')
      .eq('id', wsId)
      .maybeSingle();
    if (error) throw new LiveEligibilityLookupError('billing workspace');
    return data ? { name: data.name ?? null, personal: !!data.personal } : null;
  },
  readConfig: () => readLiveMintConfig(),
};

export function isLivePaidTier(tier: string | null | undefined) {
  return (LIVE_PAID_TIERS as readonly string[]).includes(tier ?? '');
}

/**
 * The single server decision for whether an actor may start Live billed to
 * [billingWsId]. Paid plans, or paid credit packs on the billed workspace,
 * may start Live; the free tier may only while the free kill switch is off.
 * Credits are checked last so a free workspace is told about plans first.
 */
export async function resolveLiveEligibility(
  { userId, billingWsId }: { userId: string; billingWsId: string },
  deps: LiveEligibilityDeps = defaultLiveEligibilityDeps
): Promise<LiveEligibility> {
  const config = deps.readConfig();
  let tier: string;
  let workspace: { name: string | null; personal: boolean } | null;
  let credits: LiveCreditSnapshot;
  try {
    const workspaceLookup = deps.getWorkspace(billingWsId).catch(() => null);
    tier = await deps.getTier(billingWsId);
    [workspace, credits] = await Promise.all([
      workspaceLookup,
      deps.getCredits(billingWsId, userId),
    ]);
  } catch {
    // An indeterminate tier or balance never admits a mint.
    console.error('live_eligibility_lookup_failed');
    return {
      eligible: false,
      reason: 'paused',
      isFree: true,
      tier: 'UNKNOWN',
      billing: { wsId: billingWsId, name: null, personal: false },
      params: { plans: LIVE_PAID_TIERS },
    };
  }
  const paid = isLivePaidTier(tier) || credits.packCredits > 0;
  const base = {
    isFree: !paid,
    tier,
    billing: {
      wsId: billingWsId,
      name: workspace?.name ?? null,
      personal: workspace?.personal ?? false,
    },
    params: { plans: LIVE_PAID_TIERS },
  };
  const blocked = (
    reason: LiveBlockReason,
    params: Partial<LiveEligibilityParams> = {}
  ): LiveEligibility => ({
    ...base,
    eligible: false,
    reason,
    params: { ...base.params, ...params },
  });

  if (paid ? config.paidKillSwitch : config.killSwitch) {
    return paid ? blocked('paused') : blocked('plan_required');
  }

  if (!liveReservationAdmits(credits)) {
    return blocked('credits_exhausted', {
      balance: Math.max(
        0,
        Math.floor(credits.includedRemaining + credits.packCredits)
      ),
      minimumCredits: LIVE_MIN_CREDITS,
    });
  }

  return { ...base, eligible: true, reason: null };
}

const BLOCK_STATUS: Record<LiveBlockReason, number> = {
  plan_required: 403,
  credits_exhausted: 402,
  limit_reached: 429,
  role_not_allowed: 403,
  paused: 503,
};

/** Wire shape shared by the eligibility and token routes. */
export function serializeLiveEligibility(eligibility: LiveEligibility) {
  return {
    eligible: eligibility.eligible,
    reason: eligibility.reason,
    tier: eligibility.tier,
    billing: {
      name: eligibility.billing.name,
      personal: eligibility.billing.personal,
    },
    params: eligibility.params,
  };
}

export function liveBlockedResponse(
  eligibility: LiveEligibility,
  headers?: HeadersInit
) {
  const reason = eligibility.reason ?? 'paused';
  return Response.json(
    { code: 'LIVE_BLOCKED', ...serializeLiveEligibility(eligibility), reason },
    { status: BLOCK_STATUS[reason], headers }
  );
}

/** A mint-cap refusal after eligibility passed, in the same wire shape. */
export function liveLimitResponse({
  billing,
  code,
  retryAfterSeconds,
  tier,
}: {
  billing: LiveBillingWorkspace;
  code: string;
  retryAfterSeconds: number;
  tier: string;
}) {
  const resetAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
  return Response.json(
    {
      code,
      eligible: false,
      reason: 'limit_reached' satisfies LiveBlockReason,
      tier,
      billing: { name: billing.name, personal: billing.personal },
      params: { plans: LIVE_PAID_TIERS, resetAt },
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/** Strict tier for any workspace; throws instead of assuming FREE. */
export function resolveStrictWorkspaceTier(wsId: string) {
  return defaultLiveEligibilityDeps.getTier(wsId);
}

/** An indeterminate lookup: "temporarily unavailable", never an admit. */
export function liveUnavailableResponse() {
  return Response.json(
    {
      code: 'LIVE_BLOCKED',
      eligible: false,
      reason: 'paused' satisfies LiveBlockReason,
      tier: null,
      billing: null,
      params: { plans: LIVE_PAID_TIERS },
    },
    { status: 503 }
  );
}
