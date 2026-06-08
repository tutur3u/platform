import { createClient } from '@tuturuuu/supabase/next/server';
import TaskBoardServerPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-server-page';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TaskBoardAiChatBar } from './task-board-ai-chat-bar';

export const metadata: Metadata = {
  title: 'Board Details',
  description:
    'Manage Board Details in the Boards area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const resolvedParams = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');

  const supabase = await createClient();
  const { data: miraSoul } = await supabase
    .from('mira_soul')
    .select('name')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  const assistantName = miraSoul?.name?.trim() || 'Mira';

  return (
    <TaskBoardServerPage
      params={Promise.resolve(resolvedParams)}
      idleBottomIsland={
        <TaskBoardAiChatBar
          assistantName={assistantName}
          boardId={resolvedParams.boardId}
          currentUser={{
            avatar_url: currentUser.avatar_url,
            display_name: currentUser.display_name,
            email: currentUser.email,
            full_name: currentUser.full_name,
            id: currentUser.id,
          }}
          wsId={resolvedParams.wsId}
        />
      }
    />
  );
}
