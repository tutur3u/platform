import { createClient } from '@tuturuuu/supabase/next/server';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { NextResponse } from 'next/server';

import { getPermissions } from '@tuturuuu/utils/workspace-helper';

interface Params {
  params: Promise<{
    transactionId: string;
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId, wsId } = await params;

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
    .from('wallet_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId, wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('update_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const data: Transaction & {
    origin_wallet_id?: string;
    destination_wallet_id?: string;
    tag_ids?: string[];
  } = await req.json();

  const newData = {
    ...data,
    wallet_id: data.origin_wallet_id,
  };

  delete newData.origin_wallet_id;
  delete newData.destination_wallet_id;
  const tagIds = newData.tag_ids;
  delete newData.tag_ids;

  const { error } = await supabase
    .from('wallet_transactions')
    .update(newData)
    .eq('id', transactionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating transaction' },
      { status: 500 }
    );
  }

  // Handle tags if provided
  if (tagIds !== undefined) {
    // First, delete existing tags
    await supabase
      .from('wallet_transaction_tags')
      .delete()
      .eq('transaction_id', transactionId);

    // Then insert new tags if any
    if (tagIds.length > 0) {
      const tagInserts = tagIds.map((tagId: string) => ({
        transaction_id: transactionId,
        tag_id: tagId,
      }));

      const { error: tagError } = await supabase
        .from('wallet_transaction_tags')
        .insert(tagInserts);

      if (tagError) {
        console.log(tagError);
        // Don't fail the entire transaction if tags fail
      }
    }
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId, wsId } = await params;

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
    .from('wallet_transactions')
    .delete()
    .eq('id', transactionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
