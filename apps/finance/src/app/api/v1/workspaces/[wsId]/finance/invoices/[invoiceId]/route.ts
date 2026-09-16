import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { canReassignFinanceWallet } from '@tuturuuu/utils/finance';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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

  const parsed = UpdateInvoiceSchema.safeParse(
    await req.json().catch(() => null)
  );

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
      .schema('private')
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
    notice: payload.notice,
    note: payload.note,
    wallet_id: payload.wallet_id ?? undefined,
  };

  const { data: updated, error } = await sbAdmin.rpc(
    'admin_update_finance_invoice',
    {
      p_ws_id: wsId,
      p_invoice_id: invoiceId,
      p_actor_id: access.context.user.id,
      p_payload: updatePayload,
    }
  );

  if (error) {
    return NextResponse.json(
      { message: 'Error updating invoice' },
      { status: 500 }
    );
  }

  if (!updated)
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
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

  if (!z.guid().safeParse(invoiceId).success)
    return NextResponse.json(
      { message: 'Invalid invoice ID' },
      { status: 400 }
    );

  const { data, error } = await sbAdmin.rpc('admin_delete_finance_invoice', {
    p_ws_id: wsId,
    p_invoice_id: invoiceId,
    p_actor_id: access.context.user.id,
  });

  if (error) {
    const status =
      error.code === '23503' ? 409 : error.code === 'PGRST202' ? 503 : 500;
    return NextResponse.json(
      {
        message:
          status === 409
            ? 'Invoice has linked records that must be reviewed before deletion'
            : status === 503
              ? 'Invoice recovery is not available yet. Nothing was deleted.'
              : 'Error deleting invoice',
      },
      { status }
    );
  }
  if (!data)
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
  return NextResponse.json({ message: 'success' });
}
