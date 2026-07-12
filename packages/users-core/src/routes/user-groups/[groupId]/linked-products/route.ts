import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { revalidateUserGroupCache } from '@tuturuuu/users-core/lib/user-groups/revalidate';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import {
  hasUserGroupInWorkspace,
  resolveUserGroupRouteWorkspaceId,
} from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { getGroupLinkedProducts } from '@tuturuuu/users-core/lib/user-groups/server-data';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const payloadSchema = z.object({
  productId: z.guid(),
  unitId: z.guid(),
  warehouseId: z.guid(),
});

interface Params {
  params: Promise<{ wsId: string; groupId: string }>;
}

async function getAccess(request: Request, rawWsId: string, groupId: string) {
  const permissions = await getUserGroupRoutePermissions(rawWsId, request);
  if (!permissions) {
    return {
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    } as const;
  }
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const admin = await createAdminClient({ noCookie: true });
  if (!(await hasUserGroupInWorkspace({ sbAdmin: admin, wsId, groupId }))) {
    return {
      response: NextResponse.json(
        { message: 'User group not found' },
        { status: 404 }
      ),
    } as const;
  }
  return { admin, permissions } as const;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const access = await getAccess(request, wsId, groupId);
  if ('response' in access) return access.response;
  if (
    access.permissions.withoutPermission('view_user_groups') &&
    access.permissions.withoutPermission('create_invoices')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view linked products' },
      { status: 403 }
    );
  }

  try {
    return NextResponse.json(
      await getGroupLinkedProducts({ sbAdmin: access.admin, groupId })
    );
  } catch (error) {
    console.error('Error fetching linked products', { error, groupId });
    return NextResponse.json(
      { message: 'Error fetching linked products' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const access = await getAccess(request, wsId, groupId);
  if ('response' in access) return access.response;
  if (access.permissions.withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update linked products' },
      { status: 403 }
    );
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request payload', details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { error } = await access.admin
    .from('user_group_linked_products')
    .insert({
      group_id: groupId,
      product_id: parsed.data.productId,
      warehouse_id: parsed.data.warehouseId,
      unit_id: parsed.data.unitId,
    });
  if (error) {
    console.error('Error creating linked product', { error, groupId });
    return NextResponse.json(
      { message: 'Error creating linked product' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}
