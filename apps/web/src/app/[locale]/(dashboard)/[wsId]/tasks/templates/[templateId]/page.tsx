import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import type { BoardTemplateWithContent } from '../types';
import TemplateDetailClient from './client';

interface Props {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { templateId, wsId } = await params;
  const template = await getTemplate(wsId, templateId);

  if (!template) {
    return {
      title: 'Template Not Found',
    };
  }

  return {
    title: `${template.name} - Board Template`,
    description:
      template.description ||
      'View and use this board template in your workspace.',
  };
}

export default async function TemplateDetailPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { templateId } = await params;

        // Check permissions
        const { withoutPermission } = await getPermissions({
          wsId,
        });

        if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

        // Fetch template
        const template = await getTemplate(wsId, templateId);

        if (!template) {
          notFound();
        }

        return <TemplateDetailClient wsId={wsId} template={template} />;
      }}
    </WorkspaceWrapper>
  );
}

async function getTemplate(
  wsId: string,
  templateId: string
): Promise<BoardTemplateWithContent | null> {
  const supabase = await createClient();

  const { data: template, error } = await supabase
    .from('board_templates')
    .select(
      `
      id,
      ws_id,
      created_by,
      source_board_id,
      name,
      description,
      visibility,
      content,
      created_at,
      updated_at
    `
    )
    .eq('id', templateId)
    .single();

  if (error || !template) {
    console.error('Error fetching template:', error);
    return null;
  }

  // Get current user
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

  return {
    id: template.id,
    wsId: template.ws_id,
    createdBy: template.created_by,
    sourceBoardId: template.source_board_id,
    name: template.name,
    description: template.description,
    visibility: template.visibility as 'private' | 'workspace' | 'public',
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
