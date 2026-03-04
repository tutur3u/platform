import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { walletId: id, wsId } = await params;
  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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
    .from('workspace_wallets')
    .select('*, credit_wallets(limit, statement_date, payment_date)')
    .eq('id', id)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace wallets' },
      { status: 500 }
    );
  }

  // Flatten credit data onto the wallet object
  const { credit_wallets, ...wallet } = data as typeof data & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    credit_wallets: any;
  };
  const result = {
    ...wallet,
    ...(credit_wallets
      ? {
          limit: credit_wallets.limit,
          statement_date: credit_wallets.statement_date,
          payment_date: credit_wallets.payment_date,
        }
      : {}),
  };

  return NextResponse.json(result);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const data = await req.json();
  const { walletId: id, wsId } = await params;
  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('update_wallets')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Extract credit-specific fields before updating the wallet
  const { limit, statement_date, payment_date, ...walletData } = data;

  const { data: updatedWallet, error } = await supabase
    .from('workspace_wallets')
    .update(walletData)
    .select('id')
    .eq('id', id)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace wallets' },
      { status: 500 }
    );
  }

  if (!updatedWallet) {
    return NextResponse.json({ message: 'Wallet not found' }, { status: 404 });
  }

  // Handle credit wallet data based on type
  if (data.type === 'CREDIT') {
    const { error: creditError } = await supabase
      .from('credit_wallets')
      .upsert({
        wallet_id: id,
        statement_date: statement_date ?? 1,
        payment_date: payment_date ?? 1,
        limit: limit ?? 0,
      });

    if (creditError) {
      console.log(creditError);
      return NextResponse.json(
        { message: 'Error updating credit wallet data' },
        { status: 500 }
      );
    }
  } else if (data.type === 'STANDARD') {
    // Remove credit data if switching from CREDIT to STANDARD
    const deleteResult = await supabase
      .from('credit_wallets')
      .delete()
      .eq('wallet_id', id);

    if (deleteResult.error) {
      console.error('Failed to delete credit wallet details', {
        walletId: id,
        payload: data,
        error: deleteResult.error,
      });
      return NextResponse.json(
        { message: 'Error deleting credit wallet data' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { walletId: id, wsId } = await params;
  let normalizedWsId: string;

  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('delete_wallets')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('workspace_wallets')
    .delete()
    .eq('id', id)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
