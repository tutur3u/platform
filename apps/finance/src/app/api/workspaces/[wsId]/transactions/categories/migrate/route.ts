import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.guid(),
        name: z.string().trim().min(1),
        color: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        is_expense: z.boolean().nullable().optional(),
      })
    )
    .max(500),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId } = await params;
  const actor = await resolveSatelliteRequestActor(request, 'finance');
  if (!actor)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const permissions = await getPermissions({ user: actor.user, wsId });
  if (!permissions?.containsPermission('manage_finance')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }
  const categories = parsed.data.categories;
  if (categories.length === 0) return NextResponse.json({ message: 'success' });

  const ids = categories.map((category) => category.id);
  const { data: existing, error: lookupError } = await actor.admin
    .from('transaction_categories')
    .select('id, ws_id')
    .in('id', ids);
  if (lookupError) {
    return NextResponse.json(
      { message: 'Failed to validate categories' },
      { status: 500 }
    );
  }
  if (existing?.some((category) => category.ws_id !== permissions.wsId)) {
    return NextResponse.json(
      { message: 'Category belongs to another workspace' },
      { status: 403 }
    );
  }

  const { error } = await actor.admin
    .from('transaction_categories')
    .upsert(
      categories.map((category) => ({ ...category, ws_id: permissions.wsId }))
    );
  if (error) {
    console.error('Error migrating transaction categories', error);
    return NextResponse.json(
      { message: 'Error migrating transaction categories' },
      { status: 500 }
    );
  }
  return NextResponse.json({ message: 'success' });
}
