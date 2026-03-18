import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  isExcalidrawSnapshot,
  parseStoredWhiteboardSnapshot,
} from '@/lib/whiteboards/snapshot';
import { CustomWhiteboard } from './custom-whiteboard';

export const metadata: Metadata = {
  title: 'Board Details',
  description:
    'Manage Board Details in the Whiteboards area of your Tuturuuu workspace.',
};

interface WhiteboardPageProps {
  params: Promise<{ wsId: string; boardId: string }>;
}

export default async function WhiteboardPage({ params }: WhiteboardPageProps) {
  const { wsId, boardId } = await params;
  const workspace = await getWorkspace(wsId);

  if (!workspace) {
    return notFound();
  }

  const supabase = await createAdminClient();
  const { data: whiteboard } = await supabase
    .from('workspace_whiteboards')
    .select('*')
    .eq('id', boardId)
    .eq('ws_id', workspace.id)
    .single();

  if (!whiteboard) {
    return notFound();
  }

  // Parse snapshot and check format
  const parsedSnapshot = parseStoredWhiteboardSnapshot(whiteboard.snapshot);

  // Only use snapshot if it's in Excalidraw format
  // Legacy TLDraw snapshots will start fresh
  const initialData = isExcalidrawSnapshot(parsedSnapshot)
    ? parsedSnapshot
    : undefined;

  return (
    <CustomWhiteboard
      wsId={workspace.id}
      boardId={boardId}
      boardName={whiteboard.title}
      initialData={initialData}
    />
  );
}
