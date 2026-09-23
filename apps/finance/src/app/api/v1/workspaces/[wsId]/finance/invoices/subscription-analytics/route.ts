import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { Effect } from '@tuturuuu/utils/effect';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  aggregateSubscriptionPayments,
  type PaidSubscriptionInvoice,
} from './aggregate';

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  granularity: z.enum(['monthly', 'yearly']).default('monthly'),
  userIds: z.array(z.uuid()).max(100),
  walletIds: z.array(z.uuid()).max(100),
});
const PAGE_SIZE = 500;
const MAX_ROWS = 100_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const access = await getFinanceRouteContext(
    request,
    wsId,
    await resolveFinanceRouteAuthContext(request)
  );
  if (access.response) return access.response;
  const { sbAdmin, normalizedWsId, permissions } = access.context;
  if (permissions.withoutPermission('view_invoices'))
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    year: search.get('year'),
    granularity: search.get('granularity') ?? undefined,
    userIds: search.getAll('userIds'),
    walletIds: search.getAll('walletIds'),
  });
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid analytics filters' },
      { status: 400 }
    );
  const query = parsed.data;
  // Coverage uses civil tuition months, independent of payment timestamps.
  const firstYear =
    query.granularity === 'monthly' ? query.year : query.year - 4;
  const start = `${firstYear}-01-01`;
  const end = `${query.year + 1}-01-01`;
  const months = Array.from(
    { length: (query.year - firstYear + 1) * 12 },
    (_, i) =>
      `${firstYear + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`
  );
  const program = Effect.tryPromise(async () => {
    const invoices: PaidSubscriptionInvoice[] = [];
    const seen = new Set<string>();
    let expectedCount: number | undefined;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let builder = sbAdmin
        .from('finance_invoices')
        .select(
          'id,customer_id,completed_at,paid_amount,wallet_id,subscription_months,valid_until,finance_invoice_user_groups!inner(user_group_id)',
          { count: 'exact' }
        )
        .eq('ws_id', normalizedWsId)
        .gt('paid_amount', 0)
        .not('completed_at', 'is', null)
        .or(
          `subscription_months.ov.{${months.join(',')}},and(subscription_months.is.null,valid_until.gt.${start},valid_until.lte.${end})`
        )
        .order('completed_at')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (query.userIds.length)
        builder = builder.in('customer_id', query.userIds);
      if (query.walletIds.length)
        builder = builder.in('wallet_id', query.walletIds);
      const { data, count, error } = await builder;
      if (error) throw error;
      if (
        !data ||
        count === null ||
        count > MAX_ROWS ||
        (expectedCount !== undefined && count !== expectedCount)
      )
        throw new Error('Incomplete subscription analytics');
      expectedCount = count;
      if (data.length !== Math.min(PAGE_SIZE, count - offset))
        throw new Error('Truncated subscription analytics');
      for (const row of data) {
        if (seen.has(row.id))
          throw new Error('Subscription data changed while loading');
        seen.add(row.id);
        invoices.push(row);
      }
      if (invoices.length === count) break;
    }
    const walletIds = [
      ...new Set(invoices.map((invoice) => invoice.wallet_id)),
    ];
    const currencies = new Map<string, string>();
    for (let offset = 0; offset < walletIds.length; offset += 100) {
      const { data, error } = await sbAdmin
        .schema('private')
        .from('workspace_wallets')
        .select('id,currency')
        .eq('ws_id', normalizedWsId)
        .in('id', walletIds.slice(offset, offset + 100));
      if (error) throw error;
      for (const wallet of data ?? [])
        currencies.set(wallet.id, wallet.currency);
    }
    return aggregateSubscriptionPayments(invoices, currencies, query);
  });
  try {
    const data = await Effect.runPromise(
      program.pipe(Effect.timeout('45 seconds'))
    );
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    console.error('Failed to load subscription payment analytics', {
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      {
        message:
          'Unable to load complete subscription analytics. Please retry or select a shorter period.',
      },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
