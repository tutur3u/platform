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

/** Read-only credit view of the billed workspace. */
export interface LiveCreditSnapshot {
  /** Unexpired paid credit-pack balance. */
  packCredits: number;
  /** Current-period included balance; null before the period row exists. */
  includedRemaining: number | null;
}

/**
 * The balance row `get_or_create_credit_balance` (and so the Live
 * reservation) uses: the actor's own row on a FREE subscription tier, else
 * the workspace row. Paid packs do not change the scope.
 */
export type LiveCreditScope =
  | { kind: 'user'; userId: string }
  | { kind: 'workspace' };

export function liveCreditScope(
  subscriptionTier: string,
  userId: string
): LiveCreditScope {
  return subscriptionTier === 'FREE'
    ? { kind: 'user', userId }
    : { kind: 'workspace' };
}

/** `date_trunc('month', now())` in UTC, the balance period key. */
export function liveCreditPeriodStart(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();
}

export interface LiveEligibilityDeps {
  /** Authoritative tier; throws when it cannot be determined. */
  getTier: (wsId: string) => Promise<string>;
  /** Throws when the credit view cannot be read. */
  getCredits: (
    wsId: string,
    scope: LiveCreditScope
  ) => Promise<LiveCreditSnapshot>;
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
    const productId = subscriptions?.[0]?.product_id;
    if (!productId) return 'FREE';
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
  async getCredits(wsId, scope) {
    const client = await admin();
    const now = new Date();
    const balanceQuery = client
      .from('workspace_ai_credit_balances')
      .select('total_allocated, total_used, bonus_credits')
      .eq('period_start', liveCreditPeriodStart(now));
    const scopedBalance =
      scope.kind === 'user'
        ? balanceQuery.eq('user_id', scope.userId).is('ws_id', null)
        : balanceQuery.eq('ws_id', wsId).is('user_id', null);
    const [packs, balance] = await Promise.all([
      client
        .from('workspace_credit_pack_purchases')
        .select('tokens_remaining')
        .eq('ws_id', wsId)
        .in('status', ['active', 'canceled'])
        .gt('expires_at', now.toISOString()),
      scopedBalance.maybeSingle(),
    ]);
    if (packs.error) throw new LiveEligibilityLookupError('credit packs');
    if (balance.error) throw new LiveEligibilityLookupError('credit balance');
    const packCredits = (packs.data ?? []).reduce(
      (sum, row) => sum + Number(row.tokens_remaining ?? 0),
      0
    );
    const row = balance.data;
    return {
      packCredits,
      includedRemaining: row
        ? Number(row.total_allocated ?? 0) +
          Number(row.bonus_credits ?? 0) -
          Number(row.total_used ?? 0)
        : null,
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
    // The balance scope follows the subscription tier, as the reservation's.
    [workspace, credits] = await Promise.all([
      workspaceLookup,
      deps.getCredits(billingWsId, liveCreditScope(tier, userId)),
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

  // Before the period's balance row exists the reservation itself decides.
  if (credits.includedRemaining !== null) {
    const balance = credits.includedRemaining + credits.packCredits;
    if (balance < LIVE_MIN_CREDITS) {
      return blocked('credits_exhausted', {
        balance: Math.max(0, Math.floor(balance)),
        minimumCredits: LIVE_MIN_CREDITS,
      });
    }
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
