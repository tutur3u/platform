import { TASK_DEFAULT_BOARD_ID_CONFIG_ID } from '@tuturuuu/internal-api/users';
import type { SupabaseClient } from '@tuturuuu/supabase';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { TasksNoBoardClient } from './tasks-no-board-client';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'View and manage tasks from the default task board.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

async function getActiveBoardIdById({
  boardId,
  sbAdmin,
  wsId,
}: {
  boardId: string;
  sbAdmin: SupabaseClient<Database>;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .from('workspace_boards')
    .select('id')
    .eq('id', boardId)
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .is('archived_at', null)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

async function getFirstActiveBoardId({
  sbAdmin,
  wsId,
}: {
  sbAdmin: SupabaseClient<Database>;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .from('workspace_boards')
    .select('id')
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export default async function Page({ params }: Props) {
  const { wsId: routeWsId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');

  const workspace = await getWorkspace(routeWsId);
  if (!workspace) notFound();

  const sbAdmin = await createAdminClient<Database>();
  const { data: defaultBoardConfig, error: defaultBoardConfigError } =
    await sbAdmin
      .from('user_workspace_configs')
      .select('value')
      .eq('user_id', currentUser.id)
      .eq('ws_id', workspace.id)
      .eq('id', TASK_DEFAULT_BOARD_ID_CONFIG_ID)
      .maybeSingle();

  if (defaultBoardConfigError) throw defaultBoardConfigError;

  const defaultBoardId = defaultBoardConfig?.value?.trim()
    ? await getActiveBoardIdById({
        boardId: defaultBoardConfig.value.trim(),
        sbAdmin,
        wsId: workspace.id,
      })
    : null;
  const targetBoardId =
    defaultBoardId ??
    (await getFirstActiveBoardId({
      sbAdmin,
      wsId: workspace.id,
    }));

  if (targetBoardId) {
    redirect(`/${routeWsId}/tasks/boards/${targetBoardId}?view=my_tasks`);
  }

  return (
    <TasksNoBoardClient routeWsId={routeWsId} workspaceId={workspace.id} />
  );
}
