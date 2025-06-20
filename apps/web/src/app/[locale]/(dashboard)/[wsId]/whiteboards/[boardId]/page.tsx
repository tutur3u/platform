import { CustomTldraw } from './custom-tldraw';
import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import { TLStoreSnapshot } from 'tldraw';

export default async function TLDrawPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;

  const supabase = await createClient();

  const { data: whiteboard } = await supabase
    .from('whiteboards')
    .select('*')
    .eq('id', boardId)
    .single();

  if (!whiteboard) return notFound();

  return (
    <div className="absolute inset-0">
      <CustomTldraw
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
