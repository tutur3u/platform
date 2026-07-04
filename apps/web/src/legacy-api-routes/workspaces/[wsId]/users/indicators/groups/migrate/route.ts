import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveUserGroupRouteWorkspaceId } from '@/lib/user-groups/route-helpers';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const migrateCategorySchema = z.object({
  created_at: z.string().min(1).nullable().optional(),
  description: z.string().nullable().optional(),
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  note: z.string().nullable().optional(),
});

const migrateRequestSchema = z.object({
  groups: z.array(migrateCategorySchema).optional().default([]),
});

type MetricCategoryMigrationPayload = z.infer<typeof migrateCategorySchema>;

function findDuplicateCategoryId(categories: MetricCategoryMigrationPayload[]) {
  const seenIds = new Set<string>();

  for (const category of categories) {
    const id = category.id.toLowerCase();
    if (seenIds.has(id)) return category.id;
    seenIds.add(id);
  }

  return null;
}

async function readJsonBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { containsPermission } = permissions;
  if (!containsPermission('create_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage metric categories' },
      { status: 403 }
    );
  }

  const data = await readJsonBody(req);
  const parsedData = migrateRequestSchema.safeParse(data);

  if (!parsedData.success) {
    return NextResponse.json(
      { message: 'Invalid metric category migration payload' },
      { status: 400 }
    );
  }

  const duplicateId = findDuplicateCategoryId(parsedData.data.groups);

  if (duplicateId) {
    return NextResponse.json(
      { message: 'Duplicate metric category id', id: duplicateId },
      { status: 400 }
    );
  }

  const categories = parsedData.data.groups.map((category) => ({
    created_at: category.created_at ?? null,
    description: category.description ?? null,
    id: category.id,
    name: category.name,
    note: category.note ?? null,
  }));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .schema('private')
    .rpc('admin_upsert_user_group_metric_categories_for_workspace', {
      p_categories: categories,
      p_ws_id: normalizedWsId,
    });

  if (error?.code === 'P0002') {
    return NextResponse.json(
      { message: 'Metric category not found' },
      { status: 404 }
    );
  }

  if (error) {
    console.error('Error migrating workspace indicator groups:', error);
    return NextResponse.json(
      { message: 'Error migrating workspace indicator groups' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
