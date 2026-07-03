import { getInventoryActorContext } from '@tuturuuu/inventory-core/actor';
import {
  createInventoryAuditLog,
  diffInventoryAuditFields,
} from '@tuturuuu/inventory-core/audit';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canDeleteInventorySetup,
  canUpdateInventorySetup,
} from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const CategoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    categoryId: string;
    wsId: string;
  }>;
}

async function parseBody(req: Request) {
  try {
    return { ok: true as const, value: await req.json() };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid JSON body' },
        { status: 400 }
      ),
    };
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { categoryId, wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canUpdateInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const body = await parseBody(req);
  if (!body.ok) return body.response;

  const parsed = CategoryUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: existing, error: existingError } = await sbAdmin
    .from('product_categories')
    .select('*')
    .eq('id', categoryId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    serverLogger.error(
      'Error loading inventory category for update',
      existingError
    );
    return NextResponse.json(
      { message: 'Failed to fetch inventory category' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Category not found' },
      { status: 404 }
    );
  }

  const { data, error } = await sbAdmin
    .from('product_categories')
    .update(parsed.data)
    .eq('id', categoryId)
    .eq('ws_id', wsId)
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Error updating inventory category', error);
    return NextResponse.json(
      { message: 'Failed to update inventory category' },
      { status: error.code === '23505' ? 409 : 500 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'updated',
    entityKind: 'category',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Updated category ${data.name}`,
    changedFields: diffInventoryAuditFields(existing, data),
    before: existing,
    after: data,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ data });
}

export const PUT = PATCH;

export async function DELETE(req: Request, { params }: Params) {
  const { categoryId, wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (!canDeleteInventorySetup(permissions)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const { data: existing, error: existingError } = await sbAdmin
    .from('product_categories')
    .select('*')
    .eq('id', categoryId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    serverLogger.error(
      'Error loading inventory category for deletion',
      existingError
    );
    return NextResponse.json(
      { message: 'Failed to fetch inventory category' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { message: 'Category not found' },
      { status: 404 }
    );
  }

  const { data: linkedProducts, error: linkedProductsError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('ws_id', wsId)
    .eq('category_id', categoryId)
    .limit(1);

  if (linkedProductsError) {
    serverLogger.error(
      'Error validating inventory category usage',
      linkedProductsError
    );
    return NextResponse.json(
      { message: 'Failed to validate category usage' },
      { status: 500 }
    );
  }

  if ((linkedProducts ?? []).length > 0) {
    return NextResponse.json(
      { message: 'Cannot delete category while products are assigned to it' },
      { status: 409 }
    );
  }

  const { data, error } = await sbAdmin
    .from('product_categories')
    .delete()
    .eq('id', categoryId)
    .eq('ws_id', wsId)
    .select('*')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error deleting inventory category', error);
    return NextResponse.json(
      { message: 'Failed to delete inventory category' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Category not found' },
      { status: 404 }
    );
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'deleted',
    entityKind: 'category',
    entityId: data.id,
    entityLabel: data.name,
    summary: `Deleted category ${data.name}`,
    before: existing,
    actor: await getInventoryActorContext(req, wsId),
  });

  return NextResponse.json({ message: 'success' });
}
