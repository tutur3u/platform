import { createClient } from '@tuturuuu/supabase/next/server';
import TemplateDetailClient from '@tuturuuu/ui/tu-do/templates/templateId/client';
import type { BoardTemplateWithContent } from '@tuturuuu/ui/tu-do/templates/types';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

async function getTemplate(
  templateId: string
): Promise<BoardTemplateWithContent | null> {
  const supabase = await createClient();

  const { data: template, error } = await supabase
    .from('board_templates')
    .select(
      'id, ws_id, created_by, source_board_id, name, description, visibility, content, background_path, created_at, updated_at'
    )
    .eq('id', templateId)
    .single();

  if (error || !template) {
    console.error('Error fetching template:', error);
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const content = template.content as {
    lists?: Array<{ tasks?: unknown[]; name?: string; status?: string }>;
    labels?: Array<{ name: string; color: string }>;
    settings?: {
      estimation_type?: string | null;
      allow_zero_estimates?: boolean | null;
      extended_estimation?: boolean | null;
    };
  };

  let backgroundUrl: string | null = null;
  if (template.background_path) {
    try {
      const { data: signedUrlData } = await supabase.storage
        .from('workspaces')
        .createSignedUrl(template.background_path, 3600);
      backgroundUrl = signedUrlData?.signedUrl || null;
    } catch (e) {
      console.error('Error generating signed URL:', e);
    }
  }

  return {
    id: template.id,
    wsId: template.ws_id,
    createdBy: template.created_by,
    sourceBoardId: template.source_board_id,
    name: template.name,
    description: template.description,
    visibility: template.visibility as 'private' | 'workspace' | 'public',
    backgroundUrl,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
    isOwner: template.created_by === user?.id,
    stats: {
      lists: content.lists?.length || 0,
      tasks:
        content.lists?.reduce(
          (acc, list) => acc + (list.tasks?.length || 0),
          0
        ) || 0,
      labels: content.labels?.length || 0,
    },
    content: {
      lists: (content.lists || []).map((list) => ({
        name: list.name || '',
        status: list.status || 'active',
        color: null,
        position: null,
        archived: false,
        tasks: (list.tasks || []) as Array<{
          name: string;
          description: string | null;
          priority: 'low' | 'normal' | 'high' | 'critical' | null;
          completed: boolean;
          start_date?: string | null;
          end_date?: string | null;
        }>,
      })),
      labels: content.labels || [],
      settings: content.settings || {},
    },
  };
}

/**
 * Shared Task Template Detail Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskTemplateDetailPage({ params }: Props) {
  const { wsId: id, templateId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const template = await getTemplate(templateId);
  if (!template) notFound();

  return <TemplateDetailClient wsId={wsId} template={template} />;
}
