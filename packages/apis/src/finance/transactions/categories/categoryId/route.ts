import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    categoryId: string;
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { categoryId, wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('transaction_categories')
    .select('*')
    .eq('id', categoryId)
    .eq('ws_id', wsId)
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

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { categoryId, wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('update_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('transaction_categories')
    .update(data)
    .eq('id', categoryId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { categoryId, wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('delete_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('transaction_categories')
    .delete()
    .eq('id', categoryId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
