import { ArrowLeft, Globe } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import MarketplaceClient from '@tuturuuu/ui/tu-do/templates/marketplace/client';
import type { BoardTemplate } from '@tuturuuu/ui/tu-do/templates/types';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

/**
 * Configuration options for TaskMarketplacePage
 * Allows customization of URL paths based on the consuming app
 */
interface PageConfig {
  /**
   * Base path segment for templates routes
   * @default 'templates' - for apps/tasks: /{wsId}/templates/...
   * @example 'tasks/templates' - for apps/web: /{wsId}/tasks/templates/...
   */
  templatesBasePath?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  /**
   * Optional configuration for URL customization
   */
  config?: PageConfig;
}

async function getPublicTemplates(): Promise<{ templates: BoardTemplate[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { templates: [] };

  const { data: templates, error } = await supabase
    .from('board_templates')
    .select(
      'id, ws_id, created_by, source_board_id, name, description, visibility, background_path, content, created_at, updated_at'
    )
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching marketplace templates:', error);
    return { templates: [] };
  }

  const transformedTemplates: BoardTemplate[] = await Promise.all(
    templates.map(async (template) => {
      const content = template.content as {
        lists?: Array<{ tasks?: unknown[] }>;
        labels?: unknown[];
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
      };
    })
  );

  return { templates: transformedTemplates };
}

/**
 * Shared Task Marketplace Page component.
 * Handles workspace resolution, permissions, and data fetching for public templates.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskMarketplacePage({
  params,
  config = {},
}: Props) {
  const { templatesBasePath = 'templates' } = config;

  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const { templates } = await getPublicTemplates();
  const t = await getTranslations('ws-board-templates');

  const backToTemplatesUrl = `/${wsId}/${templatesBasePath}`;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link href={backToTemplatesUrl}>
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
      <MarketplaceClient wsId={wsId} templates={templates} />
    </div>
  );
}

// Re-export the config type for consumers
export type { PageConfig as TaskMarketplacePageConfig };
