import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const TransactionSchema = z.object({
  description: z.string().min(1),
  amount: z.number(),
  origin_wallet_id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  taken_at: z.string().or(z.date()),
  report_opt_in: z.boolean().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
  creator_id: z.string().uuid().optional(),
});
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

  const parsed = TransactionSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const tagIds = data.tag_ids;
  delete data.tag_ids;

  // Ensure wallet is in this workspace
  const { data: walletCheck, error: walletErr } = await supabase
    .from('workspace_wallets')
    .select('id')
    .eq('id', data.origin_wallet_id)
    .eq('ws_id', wsId)
    .single();

  if (walletErr || !walletCheck) {
    return NextResponse.json({ message: 'Invalid wallet' }, { status: 400 });
  }

  const { data: transaction, error } = await supabase
    .from('wallet_transactions')
    .insert({
      amount: data.amount,
      description: data.description,
      wallet_id: data.origin_wallet_id,
      category_id: data.category_id || null,
      taken_at:
        typeof data.taken_at === 'string'
          ? new Date(data.taken_at).toISOString()
          : data.taken_at instanceof Date
            ? data.taken_at.toISOString()
            : data.taken_at,
      report_opt_in: data.report_opt_in || false,
      creator_id: data.creator_id || null,
    })
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
