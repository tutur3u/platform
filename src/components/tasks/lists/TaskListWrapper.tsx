import { Accordion, Checkbox, Chip, Loader, Menu } from '@mantine/core';
import { TaskList } from '../../../types/primitives/TaskList';
import React from 'react';
import TaskListAccordionControl from './TaskListAccordionControl';
import { Task } from '../../../types/primitives/Task';
import useSWR, { mutate } from 'swr';
import {
  ArrowRightCircleIcon,
  EllipsisHorizontalIcon,
  InboxIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { openConfirmModal, openModal } from '@mantine/modals';
import TaskEditForm from '../../forms/TaskEditForm';

export interface TaskListWrapperProps {
  list: TaskList;
}

const TaskListWrapper = ({ list }: TaskListWrapperProps) => {
  const [option, setOption] = React.useState('all');

  const buildQuery = (listId: string) => {
    let query = `/api/tasks?listId=${listId}`;

    if (option === 'todos') query += '&todos=true';
    if (option === 'completed') query += '&completed=true';

    return query;
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
        listId: list.id,
      }),
    });

    if (res.ok) mutate(buildQuery(list.id));
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
        completed: task.completed,
      }),
    });

    if (res.ok) mutate(buildQuery(list.id));
  };

  const deleteTask = async (taskId: string) => {
    if (!list?.id) return;

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });

    if (res.ok) mutate(buildQuery(list.id));
  };

  const setTaskCompletion = async (task: Task) => {
    if (!task.id) return;

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        completed: !task.completed,
      }),
    });

    if (res.ok) mutate(buildQuery(list.id));
  };

  const showEditTaskModal = (listId: string, task?: Task) => {
    openModal({
      title: task ? 'Edit task' : 'New task',
      centered: true,
      children: (
        <TaskEditForm
          task={task}
          listId={listId}
          onSubmit={task ? updateTask : addTask}
        />
      ),
    });
  };

  const showDeleteTaskModal = (task: Task) => {
    if (!task) return;
    openConfirmModal({
      title: (
        <div className="font-semibold">
          Delete {'"'}
          <span className="font-bold text-purple-300">{task.name}</span>
          {'" '}
          task
        </div>
      ),
      centered: true,
      children: (
        <div className="p-4 text-center">
          <p className="text-lg font-medium text-zinc-300">
            Are you sure you want to delete this task?
          </p>
          <p className="text-sm text-zinc-500">
            All of your data will be permanently removed. This action cannot be
            undone.
          </p>
        </div>
      ),
      onConfirm: () => deleteTask(task.id),
      closeOnConfirm: true,
      labels: {
        confirm: 'Delete',
        cancel: 'Cancel',
      },
    });
  };

  return (
    <Accordion.Item key={list.id} value={list.id}>
      <TaskListAccordionControl list={list}>
        <div className="font-semibold">{list.name || 'Untitled list'}</div>
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
          <div className="grid">
            {tasks &&
              tasks
                .sort((a, b) => {
                  if (a.completed && !b.completed) return 1;
                  if (!a.completed && b.completed) return -1;
                  return 0;
                })
                .map((task) => (
                  <div
                    key={task.id}
                    className="flex justify-between gap-2 rounded-lg p-2 hover:bg-zinc-800"
                  >
                    <Checkbox
                      label={
                        <div
                          className={
                            task.completed ? 'text-zinc-700 line-through' : ''
                          }
                        >
                          {task.name || 'Untitled task'}
                        </div>
                      }
                      checked={task.completed}
                      onChange={() => setTaskCompletion(task)}
                      className="flex"
                    />

                    <Menu withArrow position="right" trigger="click">
                      <Menu.Target>
                        <button className="flex h-fit items-start rounded border border-transparent text-zinc-500 opacity-0 transition duration-300 group-hover:opacity-100 hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300">
                          <EllipsisHorizontalIcon className="w-6" />
                        </button>
                      </Menu.Target>

                      <Menu.Dropdown className="font-semibold">
                        <Menu.Item
                          icon={<PencilIcon className="w-6" />}
                          onClick={() => showEditTaskModal(list.id, task)}
                        >
                          Edit task
                        </Menu.Item>
                        <Menu.Item
                          icon={<ArrowRightCircleIcon className="w-6" />}
                          disabled
                        >
                          Move task
                        </Menu.Item>
                        <Menu.Item
                          icon={<InboxIcon className="w-6" />}
                          disabled
                        >
                          Archive task
                        </Menu.Item>
                        <Menu.Item
                          icon={<TrashIcon className="w-6" />}
                          color="red"
                          onClick={() => showDeleteTaskModal(task)}
                        >
                          Delete task
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
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
