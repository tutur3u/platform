import {
  ArrowRightCircleIcon,
  EllipsisHorizontalIcon,
  InboxIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import {
  Avatar,
  Checkbox,
  Divider,
  Menu,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import { openConfirmModal, openModal } from '@mantine/modals';
import moment from 'moment';
import React from 'react';
import { Task } from '../../../types/primitives/Task';
import { User } from '../../../types/primitives/User';
import { getInitials } from '../../../utils/name-helper';
import TaskEditForm from '../../forms/TaskEditForm';
import useSWR from 'swr';
import { useUser } from '../../../hooks/useUser';

export interface TaskWrapperProps {
  task: Task;
  teamId: string;
  boardId: string;
  listId: string;
  showCompleted?: boolean;
  highlight?: boolean;
  onUpdated: () => void;
}

const TaskWrapper = ({
  task,
  listId,
  showCompleted,
  highlight = true,
  onUpdated,
}: TaskWrapperProps) => {
  const { data: rawAssigneesData } = useSWR(
    task?.id ? `/api/tasks/${task.id}/assignees` : null
  );

  const assignees: User[] | null =
    rawAssigneesData != null
      ? rawAssigneesData?.map(
          (assignee: {
            id: string;
            display_name?: string;
            email?: string;
            phone?: string;
            handle?: string;
            created_at?: string;
          }) => ({
            id: assignee.id,
            display_name: assignee.display_name,
            email: assignee.email,
            phone: assignee.phone,
            handle: assignee.handle,
            created_at: assignee.created_at,
          })
        )
      : null;

  const { user } = useUser();

  const isMyTask = assignees?.some((assignee) => assignee.id === user?.id);

  const deleteTask = async (taskId: string) => {
    if (!task?.id) return;

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });

    if (res.ok) onUpdated();
  };

  const theme = useMantineTheme();

  const showEditTaskModal = (task?: Task) => {
    openModal({
      title: (
        <div className="font-semibold">{task ? 'Edit task' : 'New task'}</div>
      ),
      centered: true,
      size: 'xl',
      overlayProps: {
        color:
          theme.colorScheme === 'dark'
            ? theme.colors.dark[9]
            : theme.colors.gray[2],
        opacity: 0.55,
        blur: 3,
      },
      children: (
        <TaskEditForm task={task} listId={listId} onUpdated={onUpdated} />
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

    if (res.ok) onUpdated();
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
        return 'bg-green-300/10 text-green-300';
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
    <div
      className={`flex items-start justify-between rounded-lg ${
        isMyTask && highlight && !task.completed
          ? 'bg-purple-300/10 text-purple-300 hover:bg-purple-300/20'
          : 'hover:bg-zinc-800'
      } transition`}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      <div className="flex h-full w-full items-start justify-start">
        <Checkbox
          checked={task.completed}
          onChange={() => setTaskCompletion(task)}
          className="flex p-2 pr-1"
        />

        <button
          className="h-full w-full p-2 pl-1 text-start text-sm"
          onClick={() => showEditTaskModal(task)}
        >
          <div
            className={
              !showCompleted && task.completed
                ? 'text-zinc-700 line-through'
                : ''
            }
          >
            {task.name || 'Untitled Task'}
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

          {!task.completed &&
            (task.priority || (assignees && assignees.length > 0)) && (
              <Divider className="my-2" />
            )}

          <div className="flex flex-wrap items-center gap-2 font-semibold text-zinc-500">
            {!task.completed && task.priority && (
              <div
                className={`${getPriorityColor(
                  task.priority
                )} flex h-fit items-center justify-center rounded-lg px-2 py-0.5`}
              >
                {getPriorityText(task.priority)}
              </div>
            )}

            <Avatar.Group>
              {assignees &&
                assignees.length > 0 &&
                assignees.map((assignee) => (
                  <Tooltip
                    key={assignee.id}
                    label={
                      <div className="font-semibold">
                        <div>{assignee?.display_name}</div>
                        {assignee?.handle && (
                          <div className="text-blue-300">
                            @{assignee.handle}
                          </div>
                        )}
                      </div>
                    }
                    color="#182a3d"
                    withArrow
                  >
                    <Avatar color="blue" radius="xl">
                      {getInitials(assignee?.display_name || 'Unknown')}
                    </Avatar>
                  </Tooltip>
                ))}
            </Avatar.Group>
          </div>
        </button>
      </div>

      <Menu withArrow position="right" trigger="click">
        <Menu.Target>
          <button className="m-1 flex h-fit items-start rounded border border-transparent text-zinc-500 opacity-0 transition duration-300 hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300 group-hover:opacity-100">
            <EllipsisHorizontalIcon className="w-6" />
          </button>
        </Menu.Target>

        <Menu.Dropdown className="font-semibold">
          <Menu.Item
            icon={<PencilIcon className="w-6" />}
            onClick={() => showEditTaskModal(task)}
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
