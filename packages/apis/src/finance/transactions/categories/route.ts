import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

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
  const data = await req.json();

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

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json(
      { message: 'Invalid request payload' },
      { status: 400 }
    );
  }

  const payload = data as Record<string, unknown>;
  const allowedFields = ['name', 'is_expense', 'icon', 'color'] as const;
  const insertPayload: Record<string, unknown> = { ws_id: wsId };

  for (const field of allowedFields) {
    if (field in payload) {
      insertPayload[field] = payload[field];
    }
  }

  const { data: res, error } = await supabase
    .from('transaction_categories')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction category' },
      { status: 500 }
    );
  }

  console.log('Created transaction category:', res);

  return NextResponse.json({ message: 'success', data: res });
}
