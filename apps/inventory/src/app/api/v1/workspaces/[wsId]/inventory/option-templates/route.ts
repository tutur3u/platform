import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  createOptionTemplate,
  listOptionTemplates,
} from '@tuturuuu/inventory-core/commerce/repository';
import { optionTemplatePayloadSchema } from '@tuturuuu/inventory-core/commerce/schemas';
import {
  canManageInventoryCatalog,
  canViewInventoryCatalog,
} from '@tuturuuu/inventory-core/permissions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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

  const data = await listOptionTemplates(authorization.value.wsId);
  return NextResponse.json({ data });
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = optionTemplatePayloadSchema.parse(await request.json());
    const data = await createOptionTemplate(authorization.value.wsId, payload);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid option template payload', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Failed to create inventory option template', error);
    return NextResponse.json(
      { message: 'Failed to create inventory option template' },
      { status: 500 }
    );
  }
}
