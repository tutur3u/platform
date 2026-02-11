import { Store } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import TemplatesClient from '@tuturuuu/ui/tu-do/templates/client';
import type { BoardTemplate } from '@tuturuuu/ui/tu-do/templates/types';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TemplatesPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const wsId = workspace.id;

  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const { templates } = await getTemplates(wsId);
  const t = await getTranslations('ws-board-templates');

  return (
    <div className="space-y-6">
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
      <TemplatesClient wsId={wsId} initialTemplates={templates} />
    </div>
  );
}

async function getTemplates(
  wsId: string
): Promise<{ templates: BoardTemplate[] }> {
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
    .eq('ws_id', wsId)
    .or(`visibility.neq.private,created_by.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching templates:', error);
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
