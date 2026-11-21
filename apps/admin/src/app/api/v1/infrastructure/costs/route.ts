import type {
  InfrastructureCostDay,
  InfrastructureCostSource,
  InfrastructureCostsResponse,
} from '@tuturuuu/internal-api/infrastructure';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

// Collected days cover the previous calendar month and the current one, with
// enough history for the anomaly baseline.
const HISTORY_DAYS = 75;
// PostgREST returns at most 1,000 rows per request; daily groups are read in
// pages of that size, in the RPC's stable order, up to this many pages.
const DAILY_PAGE_SIZE = 1_000;
const MAX_DAILY_PAGES = 20;

function utcDay(now: Date, offsetDays: number) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function firstOfPreviousMonth(now: Date) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}

async function source<T>(
  label: string,
  read: () => Promise<T>
): Promise<InfrastructureCostSource<T>> {
  try {
    return { data: await read(), status: 'ok' };
  } catch (error) {
    console.error(`Admin cost source ${label} unavailable`, error);
    return { status: 'unavailable' };
  }
}

export async function GET(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'view_finance_stats',
    true,
    request
  );
  if (!access.ok) return access.response;
  if (!access.permissions?.containsPermission('view_infrastructure'))
    return NextResponse.json(
      { error: 'Infrastructure permission required' },
      { status: 403 }
    );

  const db = access.sbAdmin;
  const privateDb = db.schema('private');
  // One timestamp fixes the reporting month and the data cutoff together.
  const now = new Date();
  const historyStart = utcDay(now, -HISTORY_DAYS);
  const previousMonth = firstOfPreviousMonth(now);
  const from = previousMonth < historyStart ? previousMonth : historyStart;
  const today = utcDay(now, 0);

  const [daily, completeDays, collection, invoices, recorded, mau] =
    await Promise.all([
      source('daily', async () => {
        const rows: InfrastructureCostDay[] = [];
        for (let page = 0; page < MAX_DAILY_PAGES; page += 1) {
          const { data, error } = await privateDb
            .rpc('get_provider_cost_daily', { p_from: from, p_to: today })
            .range(page * DAILY_PAGE_SIZE, (page + 1) * DAILY_PAGE_SIZE - 1);
          if (error) throw error;
          for (const row of data ?? [])
            rows.push({
              app: row.app_id,
              billedUsd: Number(row.billed_amount_usd),
              day: row.usage_date,
              environment: row.environment,
              listUsd:
                row.list_amount_usd === null
                  ? null
                  : Number(row.list_amount_usd),
              provider: row.provider,
              service: row.service,
            });
          if ((data?.length ?? 0) < DAILY_PAGE_SIZE) return rows;
        }
        // Every page was full: probe one more row. If it exists, report the
        // source as unavailable rather than showing truncated spend.
        const probeStart = MAX_DAILY_PAGES * DAILY_PAGE_SIZE;
        const probe = await privateDb
          .rpc('get_provider_cost_daily', { p_from: from, p_to: today })
          .range(probeStart, probeStart);
        if (probe.error) throw probe.error;
        if ((probe.data?.length ?? 0) > 0)
          throw new Error('Daily cost rows exceed the page budget');
        return rows;
      }),
      source('complete-days', async () => {
        // A provider-day is complete only when every account the provider
        // has ever collected completed it, so one account cannot hide
        // another account's missing or exhausted day.
        const [days, accounts] = await Promise.all([
          privateDb.rpc('get_provider_cost_complete_days', {
            p_from: from,
            p_to: today,
          }),
          privateDb.rpc('get_provider_cost_collection_status'),
        ]);
        if (days.error) throw days.error;
        if (accounts.error) throw accounts.error;
        const byAccount = new Map<string, Set<string>>();
        for (const row of days.data ?? [])
          byAccount.set(
            JSON.stringify([row.provider, row.account_id]),
            new Set(row.days ?? [])
          );
        const providers = new Map<string, Set<string>[]>();
        for (const row of accounts.data ?? []) {
          const list = providers.get(row.provider) ?? [];
          list.push(
            byAccount.get(JSON.stringify([row.provider, row.account_id])) ??
              new Set<string>()
          );
          providers.set(row.provider, list);
        }
        return [...providers.entries()].map(([provider, sets]) => ({
          days: [...(sets[0] ?? [])]
            .filter((day) => sets.every((set) => set.has(day)))
            .sort(),
          provider,
        }));
      }),
      source('collection', async () => {
        const { data, error } = await privateDb.rpc(
          'get_provider_cost_collection_status'
        );
        if (error) throw error;
        return (data ?? []).map((row) => ({
          days: Number(row.days),
          exhaustedDays: Number(row.exhausted_days),
          firstDay: row.first_day,
          lastCollectedAt: row.last_collected_at,
          lastDay: row.last_day,
          provider: row.provider,
        }));
      }),
      source('invoices', async () => {
        const { data, error } = await privateDb.rpc(
          'get_root_provider_invoice_postings',
          { p_from: from }
        );
        if (error) throw error;
        return (data ?? []).map((row) => ({
          accountId: row.account_id,
          amountUsd: Number(row.amount_usd),
          app: row.app_id,
          financeTransactionId: row.transaction_id ?? null,
          issuedOn: row.issued_on,
          provider: row.provider,
          reference: row.reference,
        }));
      }),
      source('recorded', async () => {
        const { data, error } = await privateDb.rpc(
          'get_external_provider_costs',
          {
            p_from: `${from}T00:00:00.000Z`,
            p_to: `${today}T00:00:00.000Z`,
            p_ws_id: ROOT_WORKSPACE_ID,
          }
        );
        if (error) throw error;
        return (data ?? []).map((row) => ({
          amountUsd: Number(row.amount_usd),
          app: row.app_id,
          month: row.month,
          provider: row.provider,
          service: row.service,
        }));
      }),
      source('monthly-active-users', async () => {
        const { data, error } = await db.rpc('get_mau_count');
        if (error) throw error;
        return Number(data ?? 0);
      }),
    ]);

  const body: InfrastructureCostsResponse = {
    collection,
    completeDays,
    daily,
    from,
    invoices,
    lastCompleteDay: utcDay(now, -1),
    monthlyActiveUsers: mau,
    recorded,
    reportingMonth: today.slice(0, 7),
    rootWorkspaceId: ROOT_WORKSPACE_ID,
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
