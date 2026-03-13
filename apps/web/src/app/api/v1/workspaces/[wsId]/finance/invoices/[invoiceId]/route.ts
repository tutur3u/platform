import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
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
  wallet_id: z.string().uuid().nullable().optional(),
});

export async function PUT(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { invoiceId, wsId } = await params;

  const permissions = await getPermissions({
    wsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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

  const { data: invoice, error } = await sbAdmin
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

  if (!invoice) {
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
  }

  return NextResponse.json({ message: 'success' });
}
