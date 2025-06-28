import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { IconPlus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WhiteboardsList, { type Whiteboard } from './client';
import CreateWhiteboardDialog from './createWhiteboardDialog';

interface WhiteboardsPageProps {
  params: Promise<{ wsId: string }>;
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
    thumbnail_url: whiteboard.thumbnail_url || undefined,
    creatorName: whiteboard.creator.display_name || 'Unknown User',
  }));
}

export default async function WhiteboardsPage({
  params,
}: WhiteboardsPageProps) {
  const { wsId } = await params;
  const t = await getTranslations('common');

  try {
    const whiteboards = await getWhiteboards(wsId);

    return (
      <div className="container mx-auto space-y-6 p-6">
        {/* Header */}
        <div className="flex justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
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
                <IconPlus className="h-4 w-4" />
                {t('new_whiteboard')}
              </Button>
            }
          />
        </div>

        <Separator />
        <WhiteboardsList wsId={wsId} whiteboards={whiteboards} />
      </div>
    );
  } catch (error) {
    console.error('Failed to load whiteboards:', error);
    return notFound();
  }
}
