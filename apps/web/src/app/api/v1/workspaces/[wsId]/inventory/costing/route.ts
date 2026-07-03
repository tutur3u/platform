import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  createCostProfile,
  listCostProfiles,
} from '@tuturuuu/inventory-core/costing';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { parseCostingJsonBody } from './request';
import {
  CostProfileListQuerySchema,
  CostProfilePayloadSchema,
} from './schemas';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canViewInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const parsed = CostProfileListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.issues, message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const data = await listCostProfiles(authorization.value.wsId, parsed.data);
    return NextResponse.json(data);
  } catch (error) {
    serverLogger.error('Failed to list inventory cost profiles', error);
    return NextResponse.json(
      { message: 'Failed to list inventory cost profiles' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = await parseCostingJsonBody(
      request,
      CostProfilePayloadSchema,
      'Invalid costing profile payload'
    );
    if (!payload.ok) return payload.response;

    const data = await createCostProfile(
      authorization.value.wsId,
      payload.data
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    serverLogger.error('Failed to create inventory cost profile', error);
    return NextResponse.json(
      { message: 'Failed to create inventory cost profile' },
      { status: 500 }
    );
  }
}
