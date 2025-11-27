import WorkspaceWrapper from '@/components/workspace-wrapper';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { TLStoreSnapshot } from 'tldraw';
import { CustomTldraw } from './custom-tldraw';

export const metadata: Metadata = {
  title: 'Board Details',
  description:
    'Manage Board Details in the Whiteboards area of your Tuturuuu workspace.',
};

interface TLDrawPageProps {
  params: Promise<{ wsId: string; boardId: string }>;
}

export default async function TLDrawPage({ params }: TLDrawPageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { boardId } = await params;
        const supabase = await createClient();

        const { data: whiteboard } = await supabase
          .from('workspace_whiteboards')
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
                  ? (JSON.parse(
                      whiteboard.snapshot as string
                    ) as TLStoreSnapshot)
                  : undefined
              }
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
