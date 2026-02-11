import { createClient } from '@tuturuuu/supabase/next/server';
import TaskDetailPage from '@tuturuuu/ui/tu-do/shared/task-detail-page';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Task Details',
  description: 'View and edit task details.',
};

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

export default async function TaskDetailPageRoute({ params }: Props) {
  const { wsId: id, taskId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const task = await getTaskDetails(taskId);
  if (!task) notFound();

  const boardId = task.list?.board_id || '';

  const taskForComponent = {
    ...task,
    description: task.description || undefined,
    list_id: task.list_id || '',
  };

  return (
    <TaskDetailPage
      task={taskForComponent as any}
      boardId={boardId}
      wsId={workspace.id}
    />
  );
}
