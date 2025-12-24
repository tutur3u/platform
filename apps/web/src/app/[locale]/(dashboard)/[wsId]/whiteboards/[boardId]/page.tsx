import { createClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { CustomWhiteboard } from './custom-whiteboard';

export const metadata: Metadata = {
  title: 'Board Details',
  description:
    'Manage Board Details in the Whiteboards area of your Tuturuuu workspace.',
};

interface WhiteboardPageProps {
  params: Promise<{ wsId: string; boardId: string }>;
}

/**
 * Checks if the snapshot data is in Excalidraw format.
 * Excalidraw format has 'elements' array at root.
 * TLDraw format has 'store' or 'schema' properties.
 */
function isExcalidrawFormat(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (
    'elements' in data &&
    Array.isArray((data as Record<string, unknown>).elements)
  );
}

export default async function WhiteboardPage({ params }: WhiteboardPageProps) {
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

        // Parse snapshot and check format
        const parsedSnapshot = whiteboard.snapshot
          ? JSON.parse(whiteboard.snapshot as string)
          : undefined;

        // Only use snapshot if it's in Excalidraw format
        // Legacy TLDraw snapshots will start fresh
        const initialData = isExcalidrawFormat(parsedSnapshot)
          ? parsedSnapshot
          : undefined;

        return (
          <CustomWhiteboard
            wsId={wsId}
            boardId={boardId}
            boardName={whiteboard.title}
            initialData={initialData}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
