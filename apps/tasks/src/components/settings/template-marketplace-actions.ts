'use server';

import type { BoardTemplate } from '@tuturuuu/ui/tu-do/templates/types';
import { resolveAuthenticatedSessionUser } from '@/lib/app-session-user';

export async function listPublicBoardTemplates(): Promise<BoardTemplate[]> {
  const { authError, supabase, user } = await resolveAuthenticatedSessionUser();

  if (authError || !supabase || !user) return [];

  const { data: templates, error } = await supabase
    .from('board_templates')
    .select(
      'id, ws_id, created_by, source_board_id, name, description, visibility, background_path, content, created_at, updated_at'
    )
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching marketplace templates:', error);
    return [];
  }

  return Promise.all(
    templates.map(async (template) => {
      const content = template.content as {
        labels?: unknown[];
        lists?: Array<{ tasks?: unknown[] }>;
      };

      let backgroundUrl: string | null = null;
      if (template.background_path) {
        try {
          const { data: signedUrlData } = await supabase.storage
            .from('workspaces')
            .createSignedUrl(template.background_path, 3600);
          backgroundUrl = signedUrlData?.signedUrl || null;
        } catch (error) {
          console.error('Error generating signed URL:', error);
        }
      }

      return {
        id: template.id,
        wsId: template.ws_id,
        createdBy: template.created_by,
        sourceBoardId: template.source_board_id,
        name: template.name,
        description: template.description,
        visibility: template.visibility as 'public',
        backgroundUrl,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        isOwner: template.created_by === user.id,
        stats: {
          labels: content.labels?.length || 0,
          lists: content.lists?.length || 0,
          tasks:
            content.lists?.reduce(
              (acc, list) => acc + (list.tasks?.length || 0),
              0
            ) || 0,
        },
      };
    })
  );
}
