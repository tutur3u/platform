import WhiteboardsList, { type Whiteboard } from './client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';

interface WhiteboardsPageProps {
  params: Promise<{ wsId: string }>;
}

async function getWhiteboards(wsId: string): Promise<Whiteboard[]> {
  const supabase = await createClient();

  const { data: whiteboards, error } = await supabase
    .from('whiteboards')
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

  try {
    const whiteboards = await getWhiteboards(wsId);
    return <WhiteboardsList whiteboards={whiteboards} />;
  } catch (error) {
    console.error('Failed to load whiteboards:', error);
    return notFound();
  }
}
