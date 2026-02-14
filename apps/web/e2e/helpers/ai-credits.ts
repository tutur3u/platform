import { createAdminClient } from '@tuturuuu/supabase/next/server';

async function getAdminClient() {
  return await createAdminClient();
}

function getCurrentPeriod() {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  return { periodStart, periodEnd };
}

/**
 * Sets a workspace-level credit balance for testing.
 */
export async function setCreditBalance(
  wsId: string,
  totalAllocated: number,
  totalUsed: number
): Promise<void> {
  const admin = await getAdminClient();
  const { periodStart, periodEnd } = getCurrentPeriod();

  await admin.from('workspace_ai_credit_balances').upsert(
    {
      ws_id: wsId,
      user_id: null,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_allocated: totalAllocated,
      total_used: totalUsed,
      bonus_credits: 0,
    },
    { onConflict: 'ws_id,period_start' }
  );
}

/**
 * Sets a user-level credit balance for testing (FREE tier accounts).
 */
export async function setCreditBalanceForUser(
  userId: string,
  totalAllocated: number,
  totalUsed: number
): Promise<void> {
  const admin = await getAdminClient();
  const { periodStart, periodEnd } = getCurrentPeriod();

  // Delete existing user balance for this period first
  await admin
    .from('workspace_ai_credit_balances')
    .delete()
    .eq('user_id', userId)
    .is('ws_id', null)
    .eq('period_start', periodStart.toISOString());

  await admin.from('workspace_ai_credit_balances').insert({
    user_id: userId,
    ws_id: null,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    total_allocated: totalAllocated,
    total_used: totalUsed,
    bonus_credits: 0,
  });
}

/**
 * Sets a workspace-level credit balance for testing (PAID tier accounts).
 */
export async function setCreditBalanceForWorkspace(
  wsId: string,
  totalAllocated: number,
  totalUsed: number
): Promise<void> {
  return setCreditBalance(wsId, totalAllocated, totalUsed);
}

/**
 * Resets credit balance for a workspace to default allocation.
 */
export async function resetCreditBalance(wsId: string): Promise<void> {
  const admin = await getAdminClient();
  const { periodStart } = getCurrentPeriod();

  await admin
    .from('workspace_ai_credit_balances')
    .delete()
    .eq('ws_id', wsId)
    .eq('period_start', periodStart.toISOString());
}

/**
 * Resets credit balance for a user.
 */
export async function resetCreditBalanceForUser(userId: string): Promise<void> {
  const admin = await getAdminClient();
  const { periodStart } = getCurrentPeriod();

  await admin
    .from('workspace_ai_credit_balances')
    .delete()
    .eq('user_id', userId)
    .is('ws_id', null)
    .eq('period_start', periodStart.toISOString());
}

/**
 * Gets the current credit balance for a workspace.
 */
export async function getCreditBalance(wsId: string) {
  const admin = await getAdminClient();
  const { periodStart } = getCurrentPeriod();

  const { data } = await admin
    .from('workspace_ai_credit_balances')
    .select('*')
    .eq('ws_id', wsId)
    .is('user_id', null)
    .eq('period_start', periodStart.toISOString())
    .maybeSingle();

  return data;
}

/**
 * Gets the current credit balance for a user.
 */
export async function getCreditBalanceForUser(userId: string) {
  const admin = await getAdminClient();
  const { periodStart } = getCurrentPeriod();

  const { data } = await admin
    .from('workspace_ai_credit_balances')
    .select('*')
    .eq('user_id', userId)
    .is('ws_id', null)
    .eq('period_start', periodStart.toISOString())
    .maybeSingle();

  return data;
}

/**
 * Gets the count of credit transactions for a workspace.
 */
export async function getTransactionCount(wsId: string): Promise<number> {
  const admin = await getAdminClient();
  const { count } = await admin
    .from('ai_credit_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  return count ?? 0;
}

/**
 * Gets transactions for a specific user.
 */
export async function getTransactionsByUser(userId: string) {
  const admin = await getAdminClient();
  const { data } = await admin
    .from('ai_credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return data ?? [];
}
