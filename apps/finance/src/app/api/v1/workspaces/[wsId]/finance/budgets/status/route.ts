import { NextResponse } from 'next/server';
import { requireBudgetAccess } from '../shared';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const access = await requireBudgetAccess(request, (await params).wsId);
  if ('error' in access) {
    return access.error;
  }

  const { sbAdmin, wsId } = access;
  const { data, error } = await sbAdmin.rpc('get_budget_status', {
    _ws_id: wsId,
  });

  if (error) {
    console.error('Error fetching budget status:', error);
    return NextResponse.json(
      { message: 'Error fetching budget status' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
