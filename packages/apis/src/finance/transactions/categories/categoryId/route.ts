import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../../../request-access';

interface Params {
  params: Promise<{
    categoryId: string;
    wsId: string;
  }>;
}

const TransactionCategoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_expense: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { categoryId, wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await sbAdmin
    .from('transaction_categories')
    .select('*')
    .eq('id', categoryId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { categoryId, wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  const parsed = TransactionCategoryUpdateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('update_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await sbAdmin
    .from('transaction_categories')
    .update(data)
    .eq('id', categoryId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { categoryId, wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('delete_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await sbAdmin
    .from('transaction_categories')
    .delete()
    .eq('id', categoryId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
