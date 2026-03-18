import { NextResponse } from 'next/server';
import { flattenWalletCreditData, getAccessibleWallet } from '../wallet-access';

interface Params {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { walletId: id, wsId } = await params;
  const result = await getAccessibleWallet({
    req,
    wsId,
    walletId: id,
    requiredPermission: 'view_transactions',
    select: '*, credit_wallets(limit, statement_date, payment_date)',
  });

  if (result.response) {
    return result.response;
  }

  return NextResponse.json(flattenWalletCreditData(result.wallet));
}

export async function PUT(req: Request, { params }: Params) {
  const data = await req.json();
  const { walletId: id, wsId } = await params;
  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId: id,
    requiredPermission: 'update_wallets',
    select: 'id',
  });

  if (access.response) {
    return access.response;
  }

  // Extract credit-specific fields before updating the wallet
  const { limit, statement_date, payment_date, ...walletData } = data;

  const { data: updatedWallet, error } = await access.context.sbAdmin
    .from('workspace_wallets')
    .update(walletData)
    .select('id')
    .eq('id', id)
    .eq('ws_id', access.context.normalizedWsId)
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
    const { error: creditError } = await access.context.sbAdmin
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
    const deleteResult = await access.context.sbAdmin
      .from('credit_wallets')
      .delete()
      .eq('wallet_id', id);

    if (deleteResult.error) {
      console.error('Failed to delete credit wallet details', {
        walletId: id,
        workspaceId: access.context.normalizedWsId,
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
  const { walletId: id, wsId } = await params;
  const access = await getAccessibleWallet({
    req,
    wsId,
    walletId: id,
    requiredPermission: 'delete_wallets',
    select: 'id',
  });

  if (access.response) {
    return access.response;
  }

  const { error } = await access.context.sbAdmin
    .from('workspace_wallets')
    .delete()
    .eq('id', id)
    .eq('ws_id', access.context.normalizedWsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace wallets' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
