import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();
    const wsId = await normalizeWorkspaceId(id, supabase);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions?.containsPermission('view_inventory')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await sbAdmin
      .from('workspace_products')
      .select(
        `id, name, description, manufacturer, category_id, inventory_products!inventory_products_product_id_fkey(unit_id, warehouse_id, inventory_units!inventory_products_unit_id_fkey(id, name), inventory_warehouses!inventory_products_warehouse_id_fkey(id, name))`
      )
      .eq('ws_id', wsId)
      .order('name');

    if (error) {
      return NextResponse.json(
        { message: 'Failed to fetch available products' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Error fetching product options:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
