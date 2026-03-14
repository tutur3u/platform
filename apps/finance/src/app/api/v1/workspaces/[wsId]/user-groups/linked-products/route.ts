import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view linked products' },
      { status: 403 }
    );
  }

  const requestUrl = new URL(req.url);
  const groupIds = requestUrl.searchParams
    .getAll('groupIds')
    .map((groupId) => groupId.trim())
    .filter(Boolean);

  if (groupIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('user_group_linked_products')
    .select(
      'group_id, workspace_user_groups(name), workspace_products(id, name, product_categories(name)), inventory_units(name, id), warehouse_id'
    )
    .in('group_id', groupIds);

  if (error) {
    console.error('Error fetching multi-group linked products:', error);
    return NextResponse.json(
      { message: 'Error fetching linked products' },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: data ?? [] });
}
