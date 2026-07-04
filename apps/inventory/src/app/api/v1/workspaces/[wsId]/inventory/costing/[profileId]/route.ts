import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  deleteCostProfile,
  getCostProfile,
  updateCostProfile,
} from '@tuturuuu/inventory-core/costing';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { parseCostingJsonBody } from '../request';
import { CostProfilePatchSchema } from '../schemas';

interface Params {
  params: Promise<{ profileId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { profileId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const data = await getCostProfile(authorization.value.wsId, profileId);
    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to load inventory cost profile', error);
    return NextResponse.json(
      { message: 'Failed to load inventory cost profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { profileId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = await parseCostingJsonBody(
      request,
      CostProfilePatchSchema,
      'Invalid costing profile payload'
    );
    if (!payload.ok) return payload.response;

    const before = await getCostProfile(authorization.value.wsId, profileId);
    const data = await updateCostProfile(
      authorization.value.wsId,
      profileId,
      payload.data
    );
    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const sbAdmin = await createAdminClient();
    const changedFields = before
      ? diffInventoryAuditFields(
          before as unknown as Record<string, unknown>,
          data as unknown as Record<string, unknown>
        )
      : Object.keys(payload.data);
    await createInventoryAuditLog(sbAdmin, {
      actor: await getInventoryActorContext(request, authorization.value.wsId),
      after: data as unknown as Record<string, unknown>,
      before: before as unknown as Record<string, unknown>,
      changedFields,
      entityId: profileId,
      entityKind: 'cost_profile',
      entityLabel: data.name,
      eventKind: payload.data.status === 'archived' ? 'archived' : 'updated',
      summary:
        payload.data.status === 'archived'
          ? `Archived costing profile ${data.name}`
          : `Updated costing profile ${data.name}`,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to update inventory cost profile', error);
    return NextResponse.json(
      { message: 'Failed to update inventory cost profile' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { profileId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const before = await getCostProfile(authorization.value.wsId, profileId);
    const deleted = await deleteCostProfile(
      authorization.value.wsId,
      profileId
    );
    if (!deleted) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const sbAdmin = await createAdminClient();
    await createInventoryAuditLog(sbAdmin, {
      actor: await getInventoryActorContext(request, authorization.value.wsId),
      before: before as unknown as Record<string, unknown>,
      entityId: profileId,
      entityKind: 'cost_profile',
      entityLabel: before?.name ?? null,
      eventKind: 'deleted',
      summary: `Deleted costing profile ${before?.name ?? profileId}`,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete inventory cost profile', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory cost profile' },
      { status: 500 }
    );
  }
}
