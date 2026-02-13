import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PromotionUpdateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    code: z.string().min(1).max(255),
    value: z.coerce.number().min(0),
    unit: z.enum(['percentage', 'currency']).optional(),
    // NULL/undefined = unlimited
    max_uses: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  })
  .refine(
    ({ unit, value }) =>
      (unit === 'percentage' && value <= 100) || unit !== 'percentage',
    {
      // TODO: i18n
      message: 'Percentage value cannot exceed 100%',
      path: ['value'],
    }
  );

interface Params {
  params: Promise<{
    wsId: string;
    promotionId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, promotionId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update promotions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const parsed = PromotionUpdateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const updateData: Record<string, unknown> = {
    name: data.name,
    description: data.description,
    code: data.code,
    value: data.value,
    use_ratio: data.unit === 'percentage',
  };

  if ('max_uses' in data) {
    updateData.max_uses = data.max_uses ?? null;
  }

  const { error } = await supabase
    .from('workspace_promotions')
    .update({
      ...updateData,
    })
    .eq('id', promotionId);

  if (error) {
    // TODO: logging
    console.error(error);
    return NextResponse.json(
      { message: 'Error updating promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const { wsId, promotionId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete promotions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('workspace_promotions')
    .delete()
    .eq('id', promotionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
