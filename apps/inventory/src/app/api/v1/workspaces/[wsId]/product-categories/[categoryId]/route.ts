import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const CategoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    categoryId: string;
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const parsed = CategoryUpdateSchema.safeParse(await req.json());
  const { categoryId: id, wsId: rawWsId } = await params;

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const authorization = await authorizeInventoryWorkspace(req, rawWsId);
  if (!authorization.ok) return authorization.response;
  const { permissions, wsId } = authorization.value;
  const { containsPermission } = permissions;
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update inventory' },
      { status: 403 }
    );
  }

  const { data: category, error } = await (await createAdminClient())
    .from('product_categories')
    .update(parsed.data)
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating product category', error);
    return NextResponse.json(
      { message: 'Error updating product category' },
      { status: 500 }
    );
  }

  if (!category) {
    return NextResponse.json(
      { message: 'Product category not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { categoryId: id, wsId: rawWsId } = await params;

  const authorization = await authorizeInventoryWorkspace(req, rawWsId);
  if (!authorization.ok) return authorization.response;
  const { permissions, wsId } = authorization.value;
  const { containsPermission } = permissions;
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete inventory' },
      { status: 403 }
    );
  }

  const { data: category, error } = await (await createAdminClient())
    .from('product_categories')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting product category', error);
    return NextResponse.json(
      { message: 'Error deleting product category' },
      { status: 500 }
    );
  }

  if (!category) {
    return NextResponse.json(
      { message: 'Product category not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
