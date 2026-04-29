import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const initiativeStatusSchema = z.enum([
  'active',
  'completed',
  'on_hold',
  'cancelled',
]);

const updateInitiativeSchema = z.object({
  name: z
    .string()
    .min(1, 'Initiative name is required')
    .max(255, 'Initiative name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  status: initiativeStatusSchema,
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; initiativeId: string }> }
) {
  try {
    const { wsId: rawWsId, initiativeId } = await params;
    const supabase = await createClient(request);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sbAdmin = await createAdminClient();

    const body = await request.json();
    const { name, description, status } = updateInitiativeSchema.parse(body);

    const { data: updatedInitiative, error } = await sbAdmin
      .from('task_initiatives')
      .update({
        name,
        description: description || null,
        status,
      })
      .eq('id', initiativeId)
      .eq('ws_id', wsId)
      .select(
        `
          *,
          creator:users!task_initiatives_creator_id_fkey(
            id,
            display_name,
            avatar_url
          ),
          task_project_initiatives(
            project_id,
            project:task_projects(
              id,
              name,
              status
            )
          )
        `
      )
      .single();

    if (error || !updatedInitiative) {
      console.error('Error updating initiative:', error);
      return NextResponse.json(
        { error: 'Failed to update initiative' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: updatedInitiative.id,
      name: updatedInitiative.name,
      description: updatedInitiative.description,
      status: updatedInitiative.status,
      created_at: updatedInitiative.created_at,
      creator: updatedInitiative.creator,
      projectsCount: updatedInitiative.task_project_initiatives?.length ?? 0,
      linkedProjects:
        updatedInitiative.task_project_initiatives?.flatMap((link) =>
          link.project ? [link.project] : []
        ) ?? [],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in PUT /api/v1/workspaces/[wsId]/task-initiatives/[initiativeId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; initiativeId: string }> }
) {
  try {
    const { wsId: rawWsId, initiativeId } = await params;
    const supabase = await createClient(request);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: deletedInitiative, error } = await sbAdmin
      .from('task_initiatives')
      .delete()
      .eq('id', initiativeId)
      .eq('ws_id', wsId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error deleting initiative:', error);
      return NextResponse.json(
        { error: 'Failed to delete initiative' },
        { status: 500 }
      );
    }

    if (!deletedInitiative) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/task-initiatives/[initiativeId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
