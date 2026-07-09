import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId, userId } = await params;
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, sbAdmin } = access.context;
  const privateDb = sbAdmin.schema('private');

  const { data, error } = await privateDb
    .from('v_user_referral_discounts')
    .select('promo_id, calculated_discount_value')
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching referral discounts:', error);
    return NextResponse.json(
      { message: 'Error fetching referral discounts' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
