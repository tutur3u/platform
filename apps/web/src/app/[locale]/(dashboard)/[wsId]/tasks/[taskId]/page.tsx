import { createClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TaskDetailPage from './task-detail-page';

export const metadata: Metadata = {
  title: 'Task Details',
  description: 'View and edit task details in your Tuturuuu workspace.',
};

// Force dynamic rendering to ensure data is always fresh
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{
    locale: string;
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

export default async function WorkspaceTaskDetailPage({ params }: Props) {
  const { wsId, taskId } = await params;

  // Get task details
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
    <TaskDetailPage
      task={taskForComponent as any}
      boardId={boardId}
      boardName={boardName}
      listName={listName}
      wsId={wsId}
    />
  );
}
