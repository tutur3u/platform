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
}

const TaskListWrapper = ({ list }: TaskListWrapperProps) => {
  const [option, setOption] = React.useState('todos');

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

  const addTask = async (task: Task) => {
    if (!list?.id) return;

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: task.name,
        description: task.description,
        priority: task.priority,
        startDate: task.start_date,
        endDate: task.end_date,
        listId: list.id,
      }),
    });

    if (res.ok) resync();
  };

  const updateTask = async (task: Task) => {
    if (!list?.id) return;

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: task.name,
        description: task.description,
        priority: task.priority,
        completed: task.completed,
        startDate: task.start_date,
        endDate: task.end_date,
      }),
    });

    if (res.ok) resync();
  };

  const showEditTaskModal = (listId: string, task?: Task) => {
    openModal({
      title: task ? 'Edit task' : 'New task',
      centered: true,
      size: 'xl',
      children: (
        <TaskEditForm
          task={task}
          listId={listId}
          onSubmit={task ? updateTask : addTask}
        />
      ),
    });
  };

  return (
    <Accordion.Item key={list.id} value={list.id}>
      <TaskListAccordionControl list={list}>
        <div className="font-semibold line-clamp-1">
          {list.name || 'Untitled list'}
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
              tasks
                .sort((a, b) => {
                  // compare end dates
                  if (a.end_date && !b.end_date) return -1;
                  if (!a.end_date && b.end_date) return 1;

                  if (a.end_date && b.end_date) {
                    if (a.end_date > b.end_date) return 1;
                    if (a.end_date < b.end_date) return -1;
                  }

                  return 0;
                })
                .sort((a, b) => {
                  if (a.priority && !b.priority) return -1;
                  if (!a.priority && b.priority) return 1;
                  return 0;
                })
                .sort((a, b) => {
                  if (a.completed && !b.completed) return 1;
                  if (!a.completed && b.completed) return -1;
                  return 0;
                })
                .map((task) => (
                  <TaskWrapper
                    key={task.id}
                    listId={list.id}
                    task={task}
                    onEdit={resync}
                    showCompleted={option === 'completed'}
                  />
                ))}
            <button
              className="flex items-center gap-3 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-400"
              onClick={() => showEditTaskModal(list.id)}
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
