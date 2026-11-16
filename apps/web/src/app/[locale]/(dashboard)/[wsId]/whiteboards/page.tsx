import { PlusIcon } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import WhiteboardsList, { type Whiteboard } from './client';
import CreateWhiteboardDialog from './createWhiteboardDialog';

export const metadata: Metadata = {
  title: 'Whiteboards',
  description: 'Manage Whiteboards in your Tuturuuu workspace.',
};

interface WhiteboardsPageProps {
  params: Promise<{ wsId: string }>;
}

export default async function WhiteboardsPage({
  params,
}: WhiteboardsPageProps) {
  await connection();

  const { wsId } = await params;
  const workspace = await getWorkspace(wsId);

  if (!workspace) {
    return notFound();
  }

  const t = await getTranslations('common');
  const viewer = await getCurrentSupabaseUser();
  const whiteboards = await getWhiteboards(
    workspace.id,
    t('unknown'),
    viewer?.id
  );

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between">
        <div className="space-y-2">
          <h1 className="font-bold text-3xl tracking-tight">
            {t('whiteboards')}
          </h1>
          <p className="text-muted-foreground">
            {t('whiteboards_description')}
          </p>
        </div>
        <CreateWhiteboardDialog
          wsId={workspace.id}
          trigger={
            <Button className="gap-2">
              <PlusIcon className="h-4 w-4" />
              {t('new_whiteboard')}
            </Button>
          }
        />
      </div>

      <Separator />
      <WhiteboardsList wsId={workspace.id} whiteboards={whiteboards} />
    </div>
  );
}

async function getWhiteboards(
  wsId: string,
  unknownCreatorLabel: string,
  viewerUserId: string | null | undefined
): Promise<Whiteboard[]> {
  const supabase = await createAdminClient();

  const { data: whiteboards, error } = await supabase
    .from('workspace_whiteboards')
    .select(
      `*,
      creator:users(display_name, handle)
    `
    )
    .eq('ws_id', wsId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching whiteboards:', error);
    throw error;
  }

  // Nameless co-member creators are named by email (D246); the resolver
  // enforces HIDE_MEMBER_EMAIL and same-workspace membership.
  const creatorNames = await resolveCoMemberNames({
    admin: supabase,
    wsId,
    viewerUserId,
    users: whiteboards.map((whiteboard) => ({
      id: whiteboard.creator_id,
      display_name: whiteboard.creator?.display_name,
      handle: whiteboard.creator?.handle,
    })),
  });

  return whiteboards.map((whiteboard) => ({
    id: whiteboard.id,
    wsId,
    title: whiteboard.title,
    description: whiteboard.description || undefined,
    dateCreated: new Date(whiteboard.created_at),
    lastModified: new Date(whiteboard.updated_at),
    creatorName:
      (whiteboard.creator ? creatorNames.get(whiteboard.creator_id) : '') ||
      resolveUserDisplayName(whiteboard.creator, {
        fallback: unknownCreatorLabel,
      }),
    archivedAt: whiteboard.archived_at
      ? new Date(whiteboard.archived_at)
      : undefined,
  }));
}
