import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const budgetPayloadSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(512).nullable().optional(),
  amount: z.number().nonnegative(),
  period: z.enum(['monthly', 'yearly', 'custom']),
  start_date: z.string().date(),
  end_date: z.string().date().nullable().optional(),
  alert_threshold: z.number().min(0).max(100).nullable().optional(),
  category_id: z.guid().nullable().optional(),
  wallet_id: z.guid().nullable().optional(),
});

export type BudgetPayload = z.infer<typeof budgetPayloadSchema>;

export async function requireBudgetAccess(request: Request, rawWsId: string) {
  const access = await getFinanceRouteContext(request, rawWsId);

  if (access.response) {
    return {
      error: access.response,
    };
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('manage_finance')) {
    return {
      error: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return {
    wsId: normalizedWsId,
    sbAdmin,
  };
}

export function toBudgetMutationPayload(wsId: string, payload: BudgetPayload) {
  return {
    ws_id: wsId,
    name: payload.name,
    description: payload.description ?? null,
    amount: payload.amount,
    period: payload.period,
    start_date: payload.start_date,
    end_date: payload.end_date ?? null,
    alert_threshold: payload.alert_threshold ?? 80,
    category_id: payload.category_id ?? null,
    wallet_id: payload.wallet_id ?? null,
  };
}
