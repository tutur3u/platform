import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { FinanceRouteAuthContext } from '../../../request-access';
import { getAccessibleWallet } from '../../wallet-access';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

const creditSummarySchema = z.object({
  availableCredit: z.coerce.number().default(0),
  balance: z.coerce.number().default(0),
  currentActivity: z.coerce.number().default(0),
  cycleEnd: z.string(),
  cycleStart: z.string(),
  daysUntilPayment: z.coerce.number().default(0),
  daysUntilStatement: z.coerce.number().default(0),
  limit: z.coerce.number().default(0),
  nextPaymentDate: z.string(),
  nextStatementDate: z.string(),
  prevCycleEnd: z.string(),
  prevCycleStart: z.string(),
  statementBalance: z.coerce.number().default(0),
  totalOutstanding: z.coerce.number().default(0),
  utilization: z.coerce.number().default(0),
});

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { walletId, wsId } = await params;
  const access = await getAccessibleWallet({
    authContext,
    req,
    wsId,
    walletId,
    requiredPermission: 'view_transactions',
    select: 'id',
  });

  if (access.response) {
    return access.response;
  }

  const { data, error } = await access.context.sbAdmin
    .schema('private')
    .rpc('get_credit_wallet_summary', {
      _actor_id: access.context.userId,
      _wallet_id: walletId,
      _ws_id: access.context.normalizedWsId,
    });

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching credit wallet summary' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Not a credit wallet' },
      { status: 400 }
    );
  }

  return NextResponse.json(creditSummarySchema.parse(data));
}
