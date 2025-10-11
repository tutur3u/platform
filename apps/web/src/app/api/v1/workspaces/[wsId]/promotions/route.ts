import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PromotionSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    code: z.string().min(1).max(255),
    value: z.coerce.number().min(0),
    unit: z.enum(['percentage', 'currency']).optional(),
    creator_id: z.uuid(),
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
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Validate request body
  const parsed = PromotionSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create promotions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const data = parsed.data;

  console.log(data);

  const { error } = await supabase.from('workspace_promotions').insert({
    name: data.name,
    description: data.description,
    code: data.code,
    value: data.value,
    creator_id: data.creator_id,
    ws_id: wsId,
    use_ratio: data.unit === 'percentage',
  });

  if (error) {
    // TODO: logging
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
