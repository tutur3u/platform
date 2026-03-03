import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId } = await params;

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .rpc('get_transaction_categories_with_amount_by_workspace', {
      p_ws_id: wsId,
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

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId } = await params;
  const parsed = TransactionCategoryCreateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('create_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data: res, error } = await supabase
    .from('transaction_categories')
    .insert({
      ...data,
      ws_id: wsId,
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
