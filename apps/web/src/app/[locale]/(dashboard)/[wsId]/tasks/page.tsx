import {
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
  TASK_LAST_BOARD_VIEW_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
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

const TASK_BOARD_VIEWS = [
  'kanban',
  'list',
  'my_tasks',
  'timeline',
  'drafts',
  'recycle_bin',
] as const;

type TaskBoardView = (typeof TASK_BOARD_VIEWS)[number];

function normalizeTaskBoardView(
  value: string | null | undefined
): TaskBoardView {
  const trimmedValue = value?.trim();
  return TASK_BOARD_VIEWS.includes(trimmedValue as TaskBoardView)
    ? (trimmedValue as TaskBoardView)
    : 'my_tasks';
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
  const { data: taskConfigs, error: taskConfigsError } = await sbAdmin
    .from('user_workspace_configs')
    .select('id,value')
    .eq('user_id', currentUser.id)
    .eq('ws_id', workspace.id)
    .in('id', [
      TASK_DEFAULT_BOARD_ID_CONFIG_ID,
      TASK_LAST_BOARD_VIEW_CONFIG_ID,
    ]);

  if (taskConfigsError) throw taskConfigsError;

  const configById = new Map(
    (taskConfigs ?? []).map((config) => [config.id, config.value] as const)
  );
  const defaultBoardConfigValue = configById.get(
    TASK_DEFAULT_BOARD_ID_CONFIG_ID
  );
  const lastBoardView = normalizeTaskBoardView(
    configById.get(TASK_LAST_BOARD_VIEW_CONFIG_ID)
  );
  const defaultBoardId = defaultBoardConfigValue?.trim()
    ? await getActiveBoardIdById({
        boardId: defaultBoardConfigValue.trim(),
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
    redirect(
      `/${routeWsId}/tasks/boards/${targetBoardId}?view=${lastBoardView}`
    );
  }

  return (
    <TasksNoBoardClient
      initialView={lastBoardView}
      routeWsId={routeWsId}
      workspaceId={workspace.id}
    />
  );
}
