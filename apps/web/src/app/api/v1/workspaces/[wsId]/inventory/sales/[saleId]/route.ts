import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { canViewInventorySales } from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{
    wsId: string;
    saleId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id, saleId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();
  const wsId = await normalizeWorkspaceId(id, supabase);
  const permissions = await getPermissions({ wsId: id, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canViewInventorySales(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await sbAdmin
    .from('finance_invoices')
    .select(
      'id, notice, note, paid_amount, created_at, completed_at, wallet_id, category_id, wallet:workspace_wallets(name), category:transaction_categories(name), customer:workspace_users!finance_invoices_customer_id_fkey(id, full_name, display_name), creator:workspace_users!finance_invoices_creator_id_fkey(id, full_name, display_name), platform_creator:users!finance_invoices_platform_creator_id_fkey(id, display_name), finance_invoice_products!inner(amount, price, owner_id, owner_name, product_id, product_name, product_unit, warehouse)'
    )
    .eq('ws_id', wsId)
    .eq('id', saleId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching inventory sale detail', error);
    return NextResponse.json(
      { message: 'Failed to fetch inventory sale detail' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}
