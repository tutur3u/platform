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

const linkProjectSchema = z.object({
  projectId: z.guid('Project id must be a valid UUID'),
});

export async function POST(
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
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const body = await request.json();
    const { projectId } = linkProjectSchema.parse(body);

    const { data: initiative } = await sbAdmin
      .from('task_initiatives')
      .select('ws_id')
      .eq('id', initiativeId)
      .single();

    if (!initiative || initiative.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Initiative not found' },
        { status: 404 }
      );
    }

    const { data: project } = await sbAdmin
      .from('task_projects')
      .select('ws_id')
      .eq('id', projectId)
      .single();

    if (!project || project.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Project not found in workspace' },
        { status: 404 }
      );
    }

    const { error: linkError } = await sbAdmin
      .from('task_project_initiatives')
      .insert({
        project_id: projectId,
        initiative_id: initiativeId,
      });

    if (linkError) {
      if ('code' in linkError && linkError.code === '23505') {
        return NextResponse.json(
          { error: 'Project already linked to initiative' },
          { status: 409 }
        );
      }

      console.error('Error linking project to initiative:', linkError);
      return NextResponse.json(
        { error: 'Failed to link project to initiative' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-initiatives/[initiativeId]/projects:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
