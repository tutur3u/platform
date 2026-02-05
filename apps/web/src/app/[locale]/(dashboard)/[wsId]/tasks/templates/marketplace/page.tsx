import { ArrowLeft, Globe } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import type { BoardTemplate } from '../types';
import MarketplaceClient from './client';

export const metadata: Metadata = {
  title: 'Template Marketplace',
  description: 'Discover templates from the community.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MarketplacePage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        // Check permissions
        const { withoutPermission } = await getPermissions({
          wsId,
        });

        if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

        const { templates } = await getPublicTemplates();
        const t = await getTranslations('ws-board-templates');

        return (
          <div className="space-y-6">
            {/* Header with Back Button */}
            <div className="space-y-4">
              <Link href={`/${wsId}/tasks/templates`}>
                <Button variant="ghost" size="sm" className="mb-4 gap-2 pl-0">
                  <ArrowLeft className="h-4 w-4" />
                  {t('marketplace.back_to_templates')}
                </Button>
              </Link>
              <FeatureSummary
                title={
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-linear-to-br from-dynamic-purple/10 to-dynamic-blue/10 p-3 text-dynamic-purple">
                      <Globe className="h-7 w-7" />
                    </div>
                    <h1 className="font-bold text-2xl tracking-tight">
                      {t('marketplace.header')}
                    </h1>
                  </div>
                }
                description={t('marketplace.description')}
              />
            </div>

            {/* Marketplace Client - handles search, sort, and rendering */}
            <MarketplaceClient wsId={wsId} templates={templates} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getPublicTemplates(): Promise<{ templates: BoardTemplate[] }> {
  const supabase = await createClient();

  // Get current user (to check ownership if needed, but for public it doesn't matter much unless we want to flag 'yours')
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
      background_path,
      content,
      created_at,
      updated_at
    `
    )
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching marketplace templates:', error);
    return { templates: [] };
  }

  // Transform templates and generate signed URLs for backgrounds
  const transformedTemplates: BoardTemplate[] = await Promise.all(
    templates.map(async (template) => {
      const content = template.content as {
        lists?: Array<{ tasks?: unknown[] }>;
        labels?: unknown[];
      };

      // Generate signed URL if there's a background path
      let backgroundUrl: string | null = null;
      if (template.background_path) {
        try {
          const { data: signedUrlData } = await supabase.storage
            .from('workspaces')
            .createSignedUrl(template.background_path, 3600); // 1 hour expiry

          backgroundUrl = signedUrlData?.signedUrl || null;
        } catch (error) {
          console.error('Error generating signed URL for template:', error);
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
        backgroundUrl, // Signed URL for display
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
    })
  );

  return { templates: transformedTemplates };
}
