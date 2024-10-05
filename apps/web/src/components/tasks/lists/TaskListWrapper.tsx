import TaskWrapper from '../core/TaskWrapper';
import TaskListAccordionControl from './TaskListAccordionControl';
import { Task } from '@/types/primitives/Task';
import { TaskList } from '@/types/primitives/TaskList';
import { Workspace } from '@/types/primitives/Workspace';
import { Accordion, Button, Loader } from '@mantine/core';
import useSWR, { mutate } from 'swr';

export interface TaskListWrapperProps {
  ws: Workspace;
  boardId: string;
  list: TaskList;
}

const TaskListWrapper = ({ ws, boardId, list }: TaskListWrapperProps) => {
  const buildQuery = (listId: string) => {
    return `/api/workspaces/${ws.id}/boards/${boardId}/lists/${listId}/tasks`;
  };

  const resync = () => {
    if (!list?.id) return;
    mutate(buildQuery(list.id));
  };

  const { data: tasks, error: tasksError } = useSWR<Task[] | null>(
    list?.id ? buildQuery(list.id) : null
  );

  const isLoading = !tasks && !tasksError;

  const showAddTaskModal = () => {
    // openModal({
    //   title: 'Add task',
    //   centered: true,
    //   size: 'xl',
    //   children: <TaskEditForm listId={list.id} onUpdated={resync} />,
    // });
  };

  return (
    <Accordion.Item
      key={list.id}
      value={list.id}
      className="border-transparent"
    >
      <TaskListAccordionControl ws={ws} boardId={boardId} list={list}>
        <div className="line-clamp-1 font-semibold">
          {list.name || 'Untitled List'}
        </div>
      </TaskListAccordionControl>

      <Accordion.Panel>
        {isLoading ? (
          <div className="flex justify-center px-4 py-8">
            <Loader size="lg" />
          </div>
        ) : (
          <div className="grid gap-2">
            {tasks &&
              tasks.map((task) => (
                <TaskWrapper
                  key={task.id}
                  task={task}
                  listId={list.id}
                  onUpdated={resync}
                />
              ))}
            <Button
              className="flex items-center gap-2 rounded border border-zinc-300/10 p-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-300/5"
              onClick={() => showAddTaskModal()}
            >
              Task
            </Button>
          </div>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
};

export default TaskListWrapper;
