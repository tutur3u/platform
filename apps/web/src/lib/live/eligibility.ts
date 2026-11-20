import { getAiCreditsStatus } from '@tuturuuu/payment-core';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getWorkspaceTier } from '@tuturuuu/utils/workspace-helper';
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

export interface LiveEligibilityDeps {
  getTier: (wsId: string) => Promise<string | null>;
  hasPaidCredits: (wsId: string) => Promise<boolean>;
  getRemainingCredits: (wsId: string, userId: string) => Promise<number>;
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

const defaultDeps: LiveEligibilityDeps = {
  getTier: (wsId) => getWorkspaceTier(wsId, { useAdmin: true }),
  async hasPaidCredits(wsId) {
    const { data, error } = await (
      await admin()
    )
      .from('workspace_credit_pack_purchases')
      .select('id')
      .eq('ws_id', wsId)
      .in('status', ['active', 'canceled'])
      .gt('expires_at', new Date().toISOString())
      .gt('tokens_remaining', 0)
      .limit(1);
    if (error) throw new Error('Failed to read paid credit packs');
    return (data ?? []).length > 0;
  },
  async getRemainingCredits(wsId, userId) {
    const status = await getAiCreditsStatus({
      accessClient: await admin(),
      userId,
      wsId,
    });
    return Number(status.remaining ?? 0);
  },
  async getWorkspace(wsId) {
    const { data, error } = await (
      await admin()
    )
      .from('workspaces')
      .select('name, personal')
      .eq('id', wsId)
      .maybeSingle();
    if (error) throw new Error('Failed to read billing workspace');
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
  deps: LiveEligibilityDeps = defaultDeps
): Promise<LiveEligibility> {
  const config = deps.readConfig();
  const [tier, workspace] = await Promise.all([
    deps.getTier(billingWsId),
    deps.getWorkspace(billingWsId),
  ]);
  const paidPlan = isLivePaidTier(tier);
  const paid = paidPlan || (await deps.hasPaidCredits(billingWsId));
  const base = {
    isFree: !paid,
    tier: tier ?? 'FREE',
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

  const balance = await deps.getRemainingCredits(billingWsId, userId);
  if (balance < LIVE_MIN_CREDITS) {
    return blocked('credits_exhausted', {
      balance: Math.max(0, Math.floor(balance)),
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
