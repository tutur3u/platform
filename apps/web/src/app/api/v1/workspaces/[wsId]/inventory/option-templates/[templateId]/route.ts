import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@/lib/inventory/commerce/auth';
import {
  deleteOptionTemplate,
  updateOptionTemplate,
} from '@/lib/inventory/commerce/repository';
import { optionTemplatePatchSchema } from '@/lib/inventory/commerce/schemas';
import { canManageInventoryCatalog } from '@/lib/inventory/permissions';

interface Params {
  params: Promise<{ templateId: string; wsId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { templateId, wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventoryCatalog(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = optionTemplatePatchSchema.parse(await request.json());
    const data = await updateOptionTemplate(
      authorization.value.wsId,
      templateId,
      payload
    );
    if (!data) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid option template payload', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to update inventory option template', error);
    return NextResponse.json(
      { message: 'Failed to update inventory option template' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { templateId, wsId: rawWsId } = await params;
  const authorization = await authorizeInventoryWorkspace(request, rawWsId);
  if (!authorization.ok) return authorization.response;

  if (!canManageInventoryCatalog(authorization.value.permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const ok = await deleteOptionTemplate(authorization.value.wsId, templateId);
  if (!ok) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
