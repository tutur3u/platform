import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/**
 * Outbound mail sent on behalf of a linked external project is metered and
 * capped, so a misconfigured or compromised satellite cannot run up an
 * unbounded SES bill against the workspace.
 *
 * The unit price is duplicated in each satellite that reports cost to its own
 * operators; this is the figure the platform actually bills against.
 */
export const EXTERNAL_PROJECT_EMAIL_UNIT_PRICE_VND = 25;

/** Deliberately modest while the capability beds in — roughly 800 emails. */
export const EXTERNAL_PROJECT_EMAIL_MONTHLY_BUDGET_VND = 20_000;

export const EXTERNAL_PROJECT_TEMPLATE_PREFIX = 'external-project:';

export type ExternalProjectEmailBudget = {
  budgetVnd: number;
  remainingVnd: number;
  sent: number;
  spentVnd: number;
  unitPriceVnd: number;
};

export function startOfBillingMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function summariseBudget(sent: number): ExternalProjectEmailBudget {
  const spentVnd = sent * EXTERNAL_PROJECT_EMAIL_UNIT_PRICE_VND;

  return {
    budgetVnd: EXTERNAL_PROJECT_EMAIL_MONTHLY_BUDGET_VND,
    remainingVnd: Math.max(
      EXTERNAL_PROJECT_EMAIL_MONTHLY_BUDGET_VND - spentVnd,
      0
    ),
    sent,
    spentVnd,
    unitPriceVnd: EXTERNAL_PROJECT_EMAIL_UNIT_PRICE_VND,
  };
}

/**
 * True when sending `count` more emails would take the workspace past its
 * monthly allowance. Checked before the send, so the cap is never exceeded
 * rather than merely detected afterwards.
 */
export function wouldExceedBudget(
  budget: ExternalProjectEmailBudget,
  count: number
) {
  return (
    budget.spentVnd + count * EXTERNAL_PROJECT_EMAIL_UNIT_PRICE_VND >
    budget.budgetVnd
  );
}

/**
 * Count what this workspace's external projects have already sent this month.
 *
 * Counts every audited attempt rather than only confirmed deliveries: SES bills
 * for accepted mail, so pending and bounced rows have still cost money, and
 * excluding them would let a bouncing loop spend past the cap for free.
 */
export async function readExternalProjectEmailBudget({
  admin,
  now = new Date(),
  wsId,
}: {
  admin: TypedSupabaseClient;
  now?: Date;
  wsId: string;
}): Promise<ExternalProjectEmailBudget> {
  const { count, error } = await admin
    .from('email_audit')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .like('template_type', `${EXTERNAL_PROJECT_TEMPLATE_PREFIX}%`)
    .gte('created_at', startOfBillingMonth(now).toISOString());

  if (error) {
    throw new Error(error.message);
  }

  return summariseBudget(count ?? 0);
}
