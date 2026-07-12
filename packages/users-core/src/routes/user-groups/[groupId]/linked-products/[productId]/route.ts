import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { revalidateUserGroupCache } from '@tuturuuu/users-core/lib/user-groups/revalidate';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import {
  hasUserGroupInWorkspace,
  resolveUserGroupRouteWorkspaceId,
} from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const payloadSchema = z.object({
  unitId: z.guid(),
  warehouseId: z.guid(),
});

interface Params {
  params: Promise<{ wsId: string; groupId: string; productId: string }>;
}

async function getAccess(request: Request, rawWsId: string, groupId: string) {
  const permissions = await getUserGroupRoutePermissions(rawWsId, request);
  if (!permissions) {
    return {
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    } as const;
  }
  if (permissions.withoutPermission('update_user_groups')) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions to update linked products' },
        { status: 403 }
      ),
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
  return { admin } as const;
}

export async function PATCH(request: Request, { params }: Params) {
  const { wsId, groupId, productId } = await params;
  const access = await getAccess(request, wsId, groupId);
  if ('response' in access) return access.response;

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request payload', details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { error } = await access.admin
    .from('user_group_linked_products')
    .update({
      warehouse_id: parsed.data.warehouseId,
      unit_id: parsed.data.unitId,
    })
    .eq('group_id', groupId)
    .eq('product_id', productId);
  if (error) {
    console.error('Error updating linked product', {
      error,
      groupId,
      productId,
    });
    return NextResponse.json(
      { message: 'Error updating linked product' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}

export async function DELETE(request: Request, { params }: Params) {
  const { wsId, groupId, productId } = await params;
  const access = await getAccess(request, wsId, groupId);
  if ('response' in access) return access.response;

  const { error } = await access.admin
    .from('user_group_linked_products')
    .delete()
    .eq('group_id', groupId)
    .eq('product_id', productId);
  if (error) {
    console.error('Error deleting linked product', {
      error,
      groupId,
      productId,
    });
    return NextResponse.json(
      { message: 'Error deleting linked product' },
      { status: 500 }
    );
  }

  revalidateUserGroupCache(groupId);
  return NextResponse.json({ message: 'success' });
}
