import {
  ArrowRightCircleIcon,
  EllipsisHorizontalIcon,
  InboxIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { Checkbox, Divider, Menu } from '@mantine/core';
import { openConfirmModal, openModal } from '@mantine/modals';
import moment from 'moment';
import React from 'react';
import { Task } from '../../../types/primitives/Task';
import TaskEditForm from '../../forms/TaskEditForm';

export interface TaskWrapperProps {
  listId: string;
  task: Task;
  onEdit: () => void;
  showCompleted?: boolean;
}

const TaskWrapper = ({
  listId,
  task,
  onEdit,
  showCompleted,
}: TaskWrapperProps) => {
  const addTask = async (task: Task) => {
    if (!listId) return;

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: task.name,
        listId: task.id,
        startDate: task.start_date,
        endDate: task.end_date,
      }),
    });

    if (res.ok) onEdit();
  };

  const updateTask = async (task: Task) => {
    if (!task?.id) return;

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

    if (res.ok) onEdit();
  };

  const deleteTask = async (taskId: string) => {
    if (!task?.id) return;

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });

    if (res.ok) onEdit();
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

    if (res.ok) onEdit();
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

  const getPriorityText = (priority: number) => {
    switch (priority) {
      case 1:
        return 'Low priority';
      case 2:
        return 'Medium priority';
      case 3:
        return 'High priority';
      case 4:
        return 'Urgent';
      case 5:
        return 'Critical';
      default:
        return 'None';
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'bg-zinc-300/10 text-zinc-300';
      case 2:
        return 'bg-blue-300/10 text-blue-300';
      case 3:
        return 'bg-purple-300/10 text-purple-300';
      case 4:
        return 'bg-orange-300/10 text-orange-300';
      case 5:
        return 'bg-red-300/10 text-red-300';
      default:
        return 'bg-zinc-300/10 text-zinc-300';
    }
  };

  return (
    <div className="flex items-start justify-between rounded-lg hover:bg-zinc-800">
      <div className="flex h-full w-full items-start justify-start">
        <Checkbox
          checked={task.completed}
          onChange={() => setTaskCompletion(task)}
          className="flex p-2 pr-1"
        />

        <button
          className="h-full w-full p-2 pl-1 text-start text-sm"
          onClick={() => showEditTaskModal(listId, task)}
        >
          <div
            className={
              !showCompleted && task.completed
                ? 'text-zinc-700 line-through'
                : ''
            }
          >
            {task.name || 'Untitled task'}
          </div>

          {!task.completed && task.end_date && (
            <div className="flex flex-wrap gap-2 font-semibold text-zinc-500">
              {/* > 7 days: green, 3-7 days: yellow, 1-3 days: orange, 0-1 days: red */}
              <span
                className={
                  moment(task.end_date).isBefore(moment().add(1, 'days'))
                    ? 'text-red-300'
                    : moment(task.end_date).isBefore(moment().add(3, 'days'))
                    ? 'text-orange-300'
                    : 'text-green-300'
                }
              >
                {moment(task.end_date).format('MMM D, HH:mm')}{' '}
                <span className="text-zinc-500">
                  ({moment(task.end_date).fromNow()})
                </span>
              </span>
            </div>
          )}

          {!task.completed && task.priority && (
            <>
              <Divider className="my-2" />
              <div className="flex flex-wrap gap-2 font-semibold text-zinc-500">
                <span
                  className={`${getPriorityColor(
                    task.priority
                  )} rounded-lg px-2 py-0.5`}
                >
                  {getPriorityText(task.priority)}
                </span>
              </div>
            </>
          )}
        </button>
      </div>

      <Menu withArrow position="right" trigger="click">
        <Menu.Target>
          <button className="m-1 flex h-fit items-start rounded border border-transparent text-zinc-500 opacity-0 transition duration-300 group-hover:opacity-100 hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300">
            <EllipsisHorizontalIcon className="w-6" />
          </button>
        </Menu.Target>

        <Menu.Dropdown className="font-semibold">
          <Menu.Item
            icon={<PencilIcon className="w-6" />}
            onClick={() => showEditTaskModal(listId, task)}
          >
            Edit task
          </Menu.Item>
          <Menu.Item icon={<ArrowRightCircleIcon className="w-6" />} disabled>
            Move task
          </Menu.Item>
          <Menu.Item icon={<InboxIcon className="w-6" />} disabled>
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
  );
};

export default TaskWrapper;
