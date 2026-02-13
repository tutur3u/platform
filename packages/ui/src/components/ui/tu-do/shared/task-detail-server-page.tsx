import { createClient } from '@tuturuuu/supabase/next/server';
import TaskDetailPageClient from '@tuturuuu/ui/tu-do/shared/task-detail-page';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    taskId: string;
  }>;
}

async function getTaskDetails(taskId: string) {
  const supabase = await createClient();

  const { data: task, error } = await supabase
    .from('tasks')
    .select(
      `
      *,
      list:task_lists!inner(
        id,
        name,
        board_id,
        board:workspace_boards!inner(
          id,
          name,
          ws_id
        )
      ),
      labels:task_labels(
        label:workspace_task_labels(
          id,
          name,
          color,
          created_at
        )
      ),
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url
        ),
        user_id
      ),
      projects:task_project_tasks(
        project:task_projects(
          id,
          name,
          status
        )
      )
    `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .single();

  if (error || !task) {
    return null;
  }

  // Flatten the nested structure for easier consumption
  return {
    ...task,
    labels:
      task.labels?.map((l: any) => l.label).filter((l: any) => l !== null) ||
      [],
    assignees:
      task.assignees
        ?.map((a: any) => ({
          user_id: a.user_id,
          ...a.user,
        }))
        .filter((a: any) => a.user_id) || [],
    projects:
      task.projects
        ?.map((p: any) => p.project)
        .filter((p: any) => p !== null) || [],
  };
}

/**
 * Shared Task Detail Page component (server-side wrapper).
 * Handles workspace resolution, authentication, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskDetailServerPage({ params }: Props) {
  const { wsId: id, taskId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const task = await getTaskDetails(taskId);
  if (!task) notFound();

  const boardId = task.list?.board_id || '';
  const boardName = task.list?.board?.name || undefined;
  const listName = task.list?.name || undefined;

  // Convert the task to match the Task type expected by the component
  const taskForComponent = {
    ...task,
    description: task.description || undefined,
    list_id: task.list_id || '',
  };

  return (
    <TaskDetailPageClient
      task={taskForComponent as any}
      boardId={boardId}
      boardName={boardName}
      listName={listName}
      wsId={workspace.id}
    />
  );
}
