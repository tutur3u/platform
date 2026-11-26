import type { SupabaseClient } from '@tuturuuu/supabase';

const DAILY_CAPACITY_PAGE_SIZE = 1000;

export type DailyCapacityCheckResult =
  | 'ok'
  | 'DAILY_LIMIT_REACHED'
  | 'DAILY_REQUEST_LIMIT_REACHED'
  | 'CREDIT_CHECK_FAILED';

export type DailyCapacitySnapshot = {
  settledCredits: number;
  heldCredits: number;
  requestCount: number;
};

type AmountPageResponse = {
  data: Array<{ amount?: number | string | null }> | null;
  count?: number | null;
  error: unknown;
};

async function readAllDailyAmounts(
  fetchPage: (from: number, to: number) => PromiseLike<AmountPageResponse>,
  transform: (amount: number) => number
): Promise<{ total: number; rowCount: number } | null> {
  let offset = 0;
  let total = 0;
  let rowCount = 0;

  while (true) {
    const { data, count, error } = await fetchPage(
      offset,
      offset + DAILY_CAPACITY_PAGE_SIZE - 1
    );
    if (error) return null;

    const rows = data ?? [];
    for (const row of rows) {
      total += transform(Number(row.amount ?? 0));
    }
    rowCount += rows.length;
    offset += rows.length;

    const expectedTotal =
      typeof count === 'number' && Number.isFinite(count) ? count : null;
    if (rows.length === 0) break;
    if (expectedTotal !== null) {
      if (offset >= expectedTotal) break;
    } else if (rows.length < DAILY_CAPACITY_PAGE_SIZE) {
      break;
    }
  }

  return { total, rowCount };
}

export async function readActivePaygCredits(
  sbAdmin: SupabaseClient,
  wsId: string
): Promise<number | null> {
  if (typeof sbAdmin?.rpc !== 'function') {
    return 0;
  }
  const { data, error } = await sbAdmin.rpc('_get_active_payg_credits', {
    p_ws_id: wsId,
  });
  if (error) {
    return null;
  }
  const value = Number(data ?? 0);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

async function resolveBalanceId(
  sbAdmin: SupabaseClient,
  params: {
    reservationId?: string;
    wsId?: string;
    userId?: string;
    tier?: string;
  }
): Promise<string | null> {
  if (params.reservationId) {
    const { data, error } = await sbAdmin
      .schema('private')
      .from('ai_credit_reservations')
      .select('balance_id')
      .eq('id', params.reservationId)
      .maybeSingle();
    if (error || !data?.balance_id) return null;
    return data.balance_id;
  }

  const nowIso = new Date().toISOString();
  let query = sbAdmin
    .from('workspace_ai_credit_balances')
    .select('id')
    .gt('period_end', nowIso)
    .order('period_start', { ascending: false })
    .limit(1);

  if (params.tier === 'FREE' && params.userId) {
    query = query.is('ws_id', null).eq('user_id', params.userId);
  } else if (params.wsId) {
    query = query.eq('ws_id', params.wsId).is('user_id', null);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

export async function readDailyCapacitySnapshot(
  sbAdmin: SupabaseClient,
  params: {
    reservationId?: string;
    wsId?: string;
    userId?: string;
    tier?: string;
  }
): Promise<DailyCapacitySnapshot | null> {
  if (
    typeof sbAdmin?.from !== 'function' ||
    typeof sbAdmin?.schema !== 'function'
  ) {
    return { settledCredits: 0, heldCredits: 0, requestCount: 0 };
  }

  const balanceId = await resolveBalanceId(sbAdmin, params);
  if (!balanceId) return null;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString();
  const nowIso = new Date().toISOString();

  // Attribute both settled deductions and active holds by balance_id and
  // paginate with exact counts so balances exceeding PostgREST's 1,000-row
  // response cap are never undercounted.
  const [settled, activeHolds] = await Promise.all([
    readAllDailyAmounts(
      (from, to) =>
        sbAdmin
          .from('ai_credit_transactions')
          .select('amount', { count: 'exact' })
          .eq('balance_id', balanceId)
          .eq('transaction_type', 'deduction')
          .gte('created_at', startOfDayIso)
          .order('id', { ascending: true })
          .range(from, to),
      (amount) => Math.abs(amount)
    ),
    readAllDailyAmounts(
      (from, to) =>
        sbAdmin
          .schema('private')
          .from('ai_credit_reservations')
          .select('amount', { count: 'exact' })
          .eq('balance_id', balanceId)
          .eq('status', 'reserved')
          .gt('expires_at', nowIso)
          .order('id', { ascending: true })
          .range(from, to),
      (amount) => Math.max(0, amount)
    ),
  ]);

  if (!settled || !activeHolds) return null;

  return {
    settledCredits: settled.total,
    heldCredits: activeHolds.total,
    requestCount: settled.rowCount + activeHolds.rowCount,
  };
}

export async function verifyDailyCapacityWithActiveHolds({
  sbAdmin,
  reservationId,
  wsId,
  userId,
  tier,
  additionalUnreservedCredits = 0,
  additionalUnreservedRequests = 0,
  dailyLimit,
  maxRequestsPerDay,
}: {
  sbAdmin: SupabaseClient;
  reservationId?: string;
  wsId?: string;
  userId?: string;
  tier?: string;
  additionalUnreservedCredits?: number;
  additionalUnreservedRequests?: number;
  dailyLimit: number | null;
  maxRequestsPerDay: number | null;
}): Promise<DailyCapacityCheckResult> {
  if (dailyLimit === null && maxRequestsPerDay === null) return 'ok';
  if (
    typeof sbAdmin?.from !== 'function' ||
    typeof sbAdmin?.schema !== 'function'
  ) {
    return 'ok';
  }

  const snapshot = await readDailyCapacitySnapshot(sbAdmin, {
    reservationId,
    wsId,
    userId,
    tier,
  });
  if (!snapshot) return 'CREDIT_CHECK_FAILED';

  if (
    dailyLimit !== null &&
    snapshot.settledCredits +
      snapshot.heldCredits +
      Math.max(0, additionalUnreservedCredits) >
      dailyLimit
  ) {
    return 'DAILY_LIMIT_REACHED';
  }
  if (
    maxRequestsPerDay !== null &&
    snapshot.requestCount + Math.max(0, additionalUnreservedRequests) >
      maxRequestsPerDay
  ) {
    return 'DAILY_REQUEST_LIMIT_REACHED';
  }
  return 'ok';
}
