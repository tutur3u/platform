import WorkspaceWrapper from '@/components/workspace-wrapper';
import { PlusIcon } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
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
  const t = await getTranslations('common');

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const whiteboards = await getWhiteboards(wsId);

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
                wsId={wsId}
                trigger={
                  <Button className="gap-2">
                    <PlusIcon className="h-4 w-4" />
                    {t('new_whiteboard')}
                  </Button>
                }
              />
            </div>

            <Separator />
            <WhiteboardsList wsId={wsId} whiteboards={whiteboards} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getWhiteboards(wsId: string): Promise<Whiteboard[]> {
  const supabase = await createClient();

  const { data: whiteboards, error } = await supabase
    .from('workspace_whiteboards')
    .select(
      `*,
      creator:users(display_name)
    `
    )
    .eq('ws_id', wsId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching whiteboards:', error);
    throw error;
  }

  return whiteboards.map((whiteboard) => ({
    id: whiteboard.id,
    title: whiteboard.title,
    description: whiteboard.description || undefined,
    dateCreated: new Date(whiteboard.created_at),
    lastModified: new Date(whiteboard.updated_at),
    creatorName: whiteboard.creator?.display_name || 'Unknown User',
  }));
}
