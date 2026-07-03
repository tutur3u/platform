import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type TemplateContent = {
  lists?: Array<{ tasks?: unknown[] }>;
  labels?: unknown[];
};

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient();

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view templates' },
        { status: 401 }
      );
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const { data: templates, error } = await sbAdmin
      .from('board_templates')
      .select(
        'id, ws_id, created_by, source_board_id, name, description, visibility, background_path, content, created_at, updated_at'
      )
      .eq('ws_id', wsId)
      .or(`visibility.neq.private,created_by.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      serverLogger.error('Failed to fetch board templates', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }

    const serializedTemplates = await Promise.all(
      (templates ?? []).map(async (template) => {
        const content = (template.content ?? {}) as TemplateContent;
        let backgroundUrl: string | null = null;

        if (template.background_path) {
          const { data: signedUrlData, error: signedUrlError } =
            await sbAdmin.storage
              .from('workspaces')
              .createSignedUrl(template.background_path, 3600);

          if (signedUrlError) {
            serverLogger.error(
              'Failed to sign board template background URL',
              signedUrlError
            );
          }

          backgroundUrl = signedUrlData?.signedUrl ?? null;
        }

        return {
          id: template.id,
          wsId: template.ws_id,
          createdBy: template.created_by,
          sourceBoardId: template.source_board_id,
          name: template.name,
          description: template.description,
          visibility: template.visibility,
          backgroundPath: template.background_path,
          backgroundUrl,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
          isOwner: template.created_by === user.id,
          stats: {
            lists: content.lists?.length ?? 0,
            tasks:
              content.lists?.reduce(
                (total, list) => total + (list.tasks?.length ?? 0),
                0
              ) ?? 0,
            labels: content.labels?.length ?? 0,
          },
        };
      })
    );

    return NextResponse.json({ templates: serializedTemplates });
  } catch (error) {
    serverLogger.error('Error listing board templates', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
