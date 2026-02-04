import { Store } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import TemplatesClient from './client';
import type { BoardTemplate } from './types';

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

export default async function TemplatesPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        // Check permissions
        const { withoutPermission } = await getPermissions({
          wsId,
        });

        if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

        // Fetch templates
        const { templates } = await getTemplates(wsId);

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
              action={
                <Link href={`/${wsId}/tasks/templates/marketplace`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Store className="h-4 w-4" />
                    {t('gallery.marketplace')}
                  </Button>
                </Link>
              }
            />

            {/* Templates Gallery */}
            <TemplatesClient wsId={wsId} initialTemplates={templates} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getTemplates(
  wsId: string
): Promise<{ templates: BoardTemplate[] }> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { templates: [] };
  }

  const { data: templates, error } = await supabase
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
      background_url,
      content,
      created_at,
      updated_at
    `
    )
    .eq('ws_id', wsId)
    .or(`visibility.neq.private,created_by.eq.${user.id}`)
    .order('created_at', { ascending: false });

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
      backgroundUrl: template.background_url,
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
