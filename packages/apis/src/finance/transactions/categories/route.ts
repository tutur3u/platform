import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
  hasAnyFinancePermission,
} from '../../request-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const TransactionCategoryCreateSchema = z.object({
  name: z.string().min(1),
  is_expense: z.boolean(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;

  if (
    !hasAnyFinancePermission(permissions, [
      'view_transactions',
      'create_invoices',
    ])
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await sbAdmin
    .rpc('get_transaction_categories_with_amount_by_workspace', {
      p_ws_id: normalizedWsId,
    })
    .order('name', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction categories' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const parsed = TransactionCategoryCreateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const { withoutPermission } = permissions;

  if (withoutPermission('create_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data: res, error } = await sbAdmin
    .from('transaction_categories')
    .insert({
      ws_id: normalizedWsId,
      name: data.name,
      is_expense: data.is_expense,
      icon: data.icon ?? null,
      color: data.color ?? null,
    })
    .select()
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success', data: res });
}
