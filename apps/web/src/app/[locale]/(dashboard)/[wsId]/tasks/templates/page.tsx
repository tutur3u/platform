import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import TemplatesClient from './client';
import type { BoardTemplate, TemplateFilter } from './types';

export const metadata: Metadata = {
  title: 'Board Templates',
  description: 'Browse and manage board templates in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    visibility?: string;
  }>;
}

export default async function TemplatesPage({ params, searchParams }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        // Check permissions
        const { withoutPermission } = await getPermissions({
          wsId,
        });

        if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

        // Get search params
        const resolvedSearchParams = await searchParams;
        const visibility = (resolvedSearchParams.visibility ||
          'workspace') as TemplateFilter;

        // Fetch templates based on visibility
        const { templates } = await getTemplates(wsId, visibility);

        const t = await getTranslations('ws-board-templates');

        return (
          <div className="space-y-6">
            {/* Header */}
            <FeatureSummary
              title={
                <h1 className="font-bold text-2xl tracking-tight">
                  {t('gallery.header')}
                </h1>
              }
              description={t('gallery.description')}
            />

            {/* Templates Gallery */}
            <TemplatesClient
              wsId={wsId}
              initialTemplates={templates}
              initialVisibility={visibility}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getTemplates(
  wsId: string,
  visibility: TemplateFilter
): Promise<{ templates: BoardTemplate[] }> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { templates: [] };
  }

  let query = supabase
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
    .order('created_at', { ascending: false });

  // Apply visibility-based filtering
  if (visibility === 'private') {
    // Only private templates created by the user in this workspace
    query = query
      .eq('ws_id', wsId)
      .eq('visibility', 'private')
      .eq('created_by', user.id);
  } else if (visibility === 'workspace') {
    // Only workspace templates in this workspace
    query = query.eq('ws_id', wsId).eq('visibility', 'workspace');
  } else if (visibility === 'public') {
    // Only public templates (from any workspace)
    query = query.eq('visibility', 'public');
  }

  const { data: templates, error } = await query;

  if (error) {
    console.error('Error fetching templates:', error);
    return { templates: [] };
  }

  // Transform templates
  const transformedTemplates: BoardTemplate[] = templates.map((template) => {
    const content = template.content as {
      lists?: Array<{ tasks?: unknown[] }>;
      labels?: unknown[];
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
    };
  });

  return { templates: transformedTemplates };
}
