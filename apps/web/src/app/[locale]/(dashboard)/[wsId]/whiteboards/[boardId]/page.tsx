import { CustomTldraw } from './custom-tldraw';
import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import { TLStoreSnapshot } from 'tldraw';

interface TLDrawPageProps {
  params: Promise<{ wsId: string; boardId: string }>;
}

export default async function TLDrawPage({ params }: TLDrawPageProps) {
  const { wsId, boardId } = await params;

  const supabase = await createClient();

  const { data: whiteboard } = await supabase
    .from('whiteboards')
    .select('*')
    .eq('id', boardId)
    .eq('ws_id', wsId)
    .single();

  if (!whiteboard) return notFound();

  return (
    <div className="absolute inset-0">
      <CustomTldraw
        wsId={wsId}
        boardId={boardId}
        initialData={
          whiteboard.snapshot
            ? (JSON.parse(whiteboard.snapshot as string) as TLStoreSnapshot)
            : undefined
        }
      />
    </div>
  );
}
