import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
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

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const parsed = CategoryUpdateSchema.safeParse(await req.json());
  const { categoryId: id, wsId: rawWsId } = await params;
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update inventory' },
      { status: 403 }
    );
  }

  const { data: category, error } = await supabase
    .from('product_categories')
    .update(parsed.data)
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error updating product category', error);
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
  const supabase = await createClient(req);
  const { categoryId: id, wsId: rawWsId } = await params;
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete inventory' },
      { status: 403 }
    );
  }

  const { data: category, error } = await supabase
    .from('product_categories')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    serverLogger.error('Error deleting product category', error);
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
