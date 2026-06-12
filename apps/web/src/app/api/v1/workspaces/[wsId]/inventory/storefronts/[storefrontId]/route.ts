import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  deleteStorefront,
  getStorefront,
  updateStorefront,
} from '@/lib/inventory/commerce/repository';
import { storefrontPatchSchema } from '@/lib/inventory/commerce/schemas';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ storefrontId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const data = await getStorefront(authorization.value.wsId, storefrontId);

    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    serverLogger.error('Failed to load inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to load inventory storefront' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = storefrontPatchSchema.parse(await request.json());
    const data = await updateStorefront(
      authorization.value.wsId,
      storefrontId,
      payload
    );

    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid storefront payload', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to update inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to update inventory storefront' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { storefrontId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const deleted = await deleteStorefront(
      authorization.value.wsId,
      storefrontId
    );

    if (!deleted) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    serverLogger.error('Failed to delete inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory storefront' },
      { status: 500 }
    );
  }
}
