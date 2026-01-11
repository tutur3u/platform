import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createRateOverrideSchema = z.object({
  user_id: z.string().uuid(),
  task_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  board_id: z.string().uuid().nullable().optional(),
  hourly_rate: z.number().nonnegative(),
  currency: z.string().default('VND'),
  effective_from: z.string(),
  effective_until: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  const taskId = searchParams.get('taskId');
  const projectId = searchParams.get('projectId');
  const boardId = searchParams.get('boardId');

  const permissions = await getPermissions({ wsId: normalizedWsId });
  const hasViewPermission =
    permissions.containsPermission('view_workforce') ||
    permissions.containsPermission('manage_workforce');

  if (!hasViewPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  let query = supabase
    .from('task_rate_overrides')
    .select('*')
    .eq('ws_id', normalizedWsId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (taskId) {
    query = query.eq('task_id', taskId);
  }

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (boardId) {
    query = query.eq('board_id', boardId);
  }

  // Order by most specific to least specific
  query = query.order('task_id', { ascending: false, nullsFirst: false });
  query = query.order('project_id', { ascending: false, nullsFirst: false });
  query = query.order('board_id', { ascending: false, nullsFirst: false });
  query = query.order('effective_from', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching rate overrides:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = createRateOverrideSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  // Validate that at least one scope (task_id, project_id, or board_id) is provided
  const { task_id, project_id, board_id } = validation.data;
  if (!task_id && !project_id && !board_id) {
    return NextResponse.json(
      {
        error:
          'At least one of task_id, project_id, or board_id must be provided',
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('task_rate_overrides')
    .insert({
      ws_id: normalizedWsId,
      ...validation.data,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating rate override:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
