import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const CreateReportSchema = z.object({
  user_id: z.string().uuid(),
  group_id: z.string().uuid(),
  title: z.string().min(1),
  content: z.string(),
  feedback: z.string(),
  score: z.number().nullable().optional(),
  scores: z.array(z.number()).nullable().optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);
    const body = await request.json();
    const parsed = CreateReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { containsPermission } = permissions;
    if (!containsPermission('create_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: workspaceUser, error: workspaceUserError } = await sbAdmin
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', authUser.id)
      .eq('ws_id', wsId)
      .single();

    if (workspaceUserError || !workspaceUser) {
      return NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      );
    }

    // Check for duplicate report
    const { data: existing } = await sbAdmin
      .from('external_user_monthly_reports')
      .select('id')
      .eq('user_id', parsed.data.user_id)
      .eq('group_id', parsed.data.group_id)
      .eq('title', parsed.data.title)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: 'Duplicate report exists' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await sbAdmin
      .from('external_user_monthly_reports')
      .insert({
        user_id: parsed.data.user_id,
        group_id: parsed.data.group_id,
        title: parsed.data.title,
        content: parsed.data.content,
        feedback: parsed.data.feedback,
        score: parsed.data.score,
        scores: parsed.data.scores,
        creator_id: workspaceUser.virtual_user_id ?? undefined,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in reports POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
