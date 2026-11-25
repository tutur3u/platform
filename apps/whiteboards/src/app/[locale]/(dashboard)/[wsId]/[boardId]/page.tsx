import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { WhiteboardBoardView } from '@/features/whiteboards/whiteboard-board-view';
import { getWhiteboardsWorkspace } from '@/lib/workspace';

export const metadata: Metadata = {
  title: 'Board Details',
  description:
    'Draw and collaborate on a whiteboard in your Tuturuuu workspace.',
};

const BOARD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface WhiteboardPageProps {
  params: Promise<{ wsId: string; boardId: string }>;
}

export default async function WhiteboardPage({ params }: WhiteboardPageProps) {
  await connection();

  const { wsId: id, boardId } = await params;
  if (!BOARD_ID_PATTERN.test(boardId)) notFound();

  const workspace = await getWhiteboardsWorkspace(id);
  if (!workspace) notFound();

  return <WhiteboardBoardView wsId={workspace.id} boardId={boardId} />;
}
