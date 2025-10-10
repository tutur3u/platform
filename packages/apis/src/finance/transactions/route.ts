import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

import { getPermissions } from '@tuturuuu/utils/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Parse the request URL
  const url = new URL(req.url);

  // Extract query parameters
  const activePage = url.searchParams.get('page');
  const itemsPerPage = url.searchParams.get('itemsPerPage');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*, workspace_wallets!inner(ws_id)')
    .eq('workspace_wallets.ws_id', wsId)
    .range(
      (Number(activePage) - 1) * Number(itemsPerPage),
      Number(itemsPerPage)
    )
    .order('taken_at', { ascending: false });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('create_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const data =
    // : Transaction & {
    //   origin_wallet_id?: string;
    //   destination_wallet_id?: string;
    //   tag_ids?: string[];
    // }
    await req.json();

  const newData = {
    ...data,
    wallet_id: data.origin_wallet_id,
  };

  delete newData.origin_wallet_id;
  delete newData.destination_wallet_id;
  const tagIds = newData.tag_ids;
  delete newData.tag_ids;

  const { data: transaction, error } = await supabase
    .from('wallet_transactions')
    .upsert(newData)
    .eq('id', data.id)
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating transaction' },
      { status: 500 }
    );
  }

  // Handle tags if provided
  if (tagIds && tagIds.length > 0 && transaction?.id) {
    const tagInserts = tagIds.map((tagId: string) => ({
      transaction_id: transaction.id,
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

  return NextResponse.json({ message: 'success' });
}
