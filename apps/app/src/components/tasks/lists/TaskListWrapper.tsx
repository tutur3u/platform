import { Accordion, Chip, Loader } from '@mantine/core';
import { TaskList } from '../../../types/primitives/TaskList';
import React from 'react';
import TaskListAccordionControl from './TaskListAccordionControl';
import { Task } from '../../../types/primitives/Task';
import useSWR, { mutate } from 'swr';
import { PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import TaskEditForm from '../../forms/TaskEditForm';
import TaskWrapper from '../core/TaskWrapper';

export interface TaskListWrapperProps {
  list: TaskList;
  option: string;
  setOption: (option: string) => void;
}

const TaskListWrapper = ({
  list,
  option = 'todos',
  setOption,
}: TaskListWrapperProps) => {
  const buildQuery = (listId: string) => {
    let query = `/api/tasks?listId=${listId}`;

    if (option === 'todos') query += '&todos=true';
    if (option === 'completed') query += '&completed=true';

    return query;
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
    openModal({
      title: 'Add task',
      centered: true,
      size: 'xl',
      children: (
        <TaskEditForm
          listId={list.id}
          boardId={list.board_id}
          onUpdated={resync}
        />
      ),
    });
  };

  return (
    <Accordion.Item
      key={list.id}
      value={list.id}
      className="border-zinc-800/80"
    >
      <TaskListAccordionControl list={list}>
        <div className="line-clamp-1 font-semibold">
          {list.name || 'Untitled List'}
        </div>
      </TaskListAccordionControl>
      <Accordion.Panel>
        <Chip.Group
          multiple={false}
          value={option}
          onChange={setOption}
          className="my-2 flex flex-wrap justify-center gap-2"
        >
          <Chip variant="filled" value="all">
            All
          </Chip>
          <Chip color="yellow" variant="filled" value="todos">
            Todos
          </Chip>
          <Chip color="green" variant="filled" value="completed">
            Completed
          </Chip>
        </Chip.Group>

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
                  showCompleted={option === 'completed'}
                  onUpdated={resync}
                />
              ))}
            <button
              className="flex items-center gap-3 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-400"
              onClick={() => showAddTaskModal()}
            >
              <PlusIcon className="w-5" />
              <div className="text-sm font-semibold">Task</div>
            </button>
          </div>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
};

export default TaskListWrapper;
