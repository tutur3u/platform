import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  createBundle,
  InvalidInventoryBundleComponentTargetError,
  listBundles,
} from '@/lib/inventory/commerce/bundles';
import {
  BundleStatusSchema,
  bundlePayloadSchema,
  listQuerySchema,
} from '@/lib/inventory/commerce/schemas';
import {
  canManageInventoryCatalog,
  canViewInventoryCatalog,
} from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;

  if (!canViewInventoryCatalog(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = listQuerySchema(BundleStatusSchema).safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = await listBundles(authorization.value.wsId, parsed.data);
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = bundlePayloadSchema.parse(await request.json());
    const data = await createBundle(authorization.value.wsId, payload);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid inventory bundle payload', errors: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof InvalidInventoryBundleComponentTargetError) {
      return NextResponse.json(
        { message: 'Invalid inventory bundle component target' },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to create inventory bundle', error);
    return NextResponse.json(
      { message: 'Failed to create inventory bundle' },
      { status: 500 }
    );
  }
}
