import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { canReassignFinanceWallet } from '@tuturuuu/utils/finance';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveFinanceRouteAuthContext } from '@/lib/finance-route-auth';

interface Params {
  params: Promise<{
    invoiceId: string;
    wsId: string;
  }>;
}

const UpdateInvoiceSchema = z.object({
  notice: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  wallet_id: z.guid().nullable().optional(),
});

export async function PUT(req: Request, { params }: Params) {
  const { invoiceId, wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('update_invoices')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = UpdateInvoiceSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  const { data: existingInvoice, error: existingInvoiceError } = await sbAdmin
    .from('finance_invoices')
    .select('id, wallet_id')
    .eq('id', invoiceId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingInvoiceError) {
    return NextResponse.json(
      { message: 'Error loading invoice' },
      { status: 500 }
    );
  }

  if (!existingInvoice) {
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
  }

  if (
    !canReassignFinanceWallet({
      permissions,
      currentWalletId: existingInvoice.wallet_id,
      requestedWalletId: payload.wallet_id,
    })
  ) {
    return NextResponse.json(
      {
        message: 'Insufficient permissions to change the wallet for invoices',
      },
      { status: 403 }
    );
  }

  if (payload.wallet_id) {
    const { data: wallet, error: walletError } = await sbAdmin
      .from('workspace_wallets')
      .select('id')
      .eq('id', payload.wallet_id)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (walletError) {
      return NextResponse.json(
        { message: 'Failed to validate wallet' },
        { status: 500 }
      );
    }

    if (!wallet) {
      return NextResponse.json({ message: 'Invalid wallet' }, { status: 400 });
    }
  }

  const updatePayload = {
    notice: payload.notice ?? null,
    note: payload.note ?? null,
    wallet_id: payload.wallet_id ?? undefined,
  };

  const { error } = await sbAdmin
    .from('finance_invoices')
    .update(updatePayload)
    .eq('id', invoiceId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { message: 'Error updating invoice' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { invoiceId, wsId: rawWsId } = await params;
  const access = await getFinanceRouteContext(
    req,
    rawWsId,
    await resolveFinanceRouteAuthContext(req)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;

  if (permissions.withoutPermission('delete_invoices')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data: existingInvoice, error: existingInvoiceError } = await sbAdmin
    .from('finance_invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingInvoiceError) {
    return NextResponse.json(
      { message: 'Error loading invoice' },
      { status: 500 }
    );
  }

  if (!existingInvoice) {
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
  }

  const { error: productsError } = await sbAdmin
    .from('finance_invoice_products')
    .delete()
    .eq('invoice_id', invoiceId);

  if (productsError) {
    return NextResponse.json(
      { message: 'Error deleting invoice products' },
      { status: 500 }
    );
  }

  const { error: promotionsError } = await sbAdmin
    .from('finance_invoice_promotions')
    .delete()
    .eq('invoice_id', invoiceId);

  if (promotionsError) {
    return NextResponse.json(
      { message: 'Error deleting invoice promotions' },
      { status: 500 }
    );
  }

  const { error } = await sbAdmin
    .from('finance_invoices')
    .delete()
    .eq('id', invoiceId)
    .eq('ws_id', wsId);

  if (error) {
    return NextResponse.json(
      { message: 'Error deleting invoice' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
