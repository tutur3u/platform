import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import { importCostingCsv } from '@/lib/inventory/costing';
import { canManageInventorySetup } from '@/lib/inventory/permissions';
import { parseCostingJsonBody } from '../request';
import { CostingImportPayloadSchema } from '../schemas';

interface Params {
  params: Promise<{ wsId: string }>;
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
      CostingImportPayloadSchema,
      'Invalid costing import payload'
    );
    if (!payload.ok) return payload.response;

    const data = await importCostingCsv(authorization.value.wsId, payload.data);
    return NextResponse.json(data, {
      status: payload.data.commit ? 201 : 200,
    });
  } catch (error) {
    serverLogger.error('Failed to import inventory costing CSV', error);
    return NextResponse.json(
      { message: 'Failed to import inventory costing CSV' },
      { status: 500 }
    );
  }
}
