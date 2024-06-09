'use client';

import BoardEditForm from '../../../../../../components/forms/BoardEditForm';
import TaskListEditForm from '../../../../../../components/forms/TaskListEditForm';
import TaskListWrapper from '../../../../../../components/tasks/lists/TaskListWrapper';
import { useUser } from '@/hooks/useUser';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Task } from '@/types/primitives/Task';
import { TaskBoard } from '@/types/primitives/TaskBoard';
import { TaskList } from '@/types/primitives/TaskList';
import {
  EllipsisHorizontalIcon,
  QueueListIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/solid';
import {
  Accordion,
  ActionIcon,
  Button,
  Divider,
  Loader,
  Menu,
  SegmentedControl,
} from '@mantine/core';
import { openConfirmModal, openModal } from '@mantine/modals';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';

interface Props {
  params: {
    wsId?: string;
    boardId?: string;
  };
}

export default function WorkspaceBoardEditor({
  params: { wsId, boardId },
}: Props) {
  // await verifyHasSecrets(wsId, ['ENABLE_PROJECTS'], `/${wsId}`);

  const router = useRouter();
  const { ws } = useWorkspaces();

  const { data: board } = useSWR<TaskBoard>(
    wsId && boardId ? `/api/workspaces/${wsId}/boards/${boardId}` : null
  );

  const [mode, setMode] = useState('list');

  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const { user } = useUser();

  const canFetchLists = user?.id && boardId;

  const { data: lists, error: listsError } = useSWR<TaskList[] | null>(
    canFetchLists && ws
      ? `/api/workspaces/${ws.id}/boards/${boardId}/lists`
      : null
  );

  const buildQuery = (wsId: string, listId: String) => {
    return `/api/workspaces/${wsId}/boards/${boardId}/lists/${listId}/tasks`;
  };

  const canFetchTasks = user?.id && boardId && selectedListId;
  const { data: tasks, error: tasksError } = useSWR<Task[] | null>(
    canFetchTasks && ws
      ? `/api/workspaces/${ws.id}/boards/${boardId}/lists/${selectedListId}/tasks`
      : null
  );

  const isListsLoading = !lists && !listsError && canFetchLists;
  const isTasksLoading = !tasks && !tasksError && canFetchTasks;

  const isContentLoading = isListsLoading || isTasksLoading;

  const deleteBoard = async (wsId: string) =>
    fetch(`/api/workspaces/${wsId}/boards/${boardId}`, {
      method: 'DELETE',
    })
      .then((res) => res.json())
      .then(() => router.push(`/${wsId}/boards`));

  const updateBoard = async (board: TaskBoard) => {
    if (!boardId || !ws) return;
    const res = await fetch(`/api/workspaces/${ws.id}/boards/${boardId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: board.name,
      }),
    });

    if (res.ok) {
      await mutate(`/api/workspaces/${ws.id}/boards/${boardId}`);
    }
  };

  const showEditBoardModal = (board?: TaskBoard) => {
    openModal({
      title: board ? 'Edit board' : 'New board',
      centered: true,
      children: <BoardEditForm board={board} onSubmit={updateBoard} />,
    });
  };

  const showDeleteBoardModal = (board?: TaskBoard) => {
    if (!board || !ws) return;

    openConfirmModal({
      title: (
        <div className="font-semibold">
          Delete {'"'}
          <span className="font-bold text-purple-300">{board.name}</span>
          {'" '}
          board
        </div>
      ),
      centered: true,
      children: (
        <div className="p-4 text-center">
          <p className="text-lg font-medium text-zinc-300">
            Are you sure you want to delete this board?
          </p>
          <p className="text-foreground/80 text-sm">
            All of your data will be permanently removed. This action cannot be
            undone.
          </p>
        </div>
      ),
      onConfirm: () => deleteBoard(ws.id),
      closeOnConfirm: true,
      labels: {
        confirm: 'Delete',
        cancel: 'Cancel',
      },
    });
  };

  const addList = async (list: TaskList) => {
    if (!boardId || !ws) return;

    const res = await fetch(
      `/api/workspaces/${ws.id}/boards/${boardId}/lists`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: list.name,
          boardId,
        }),
      }
    );

    if (res.ok)
      await mutate(`/api/workspaces/${ws.id}/boards/${boardId}/lists`);
  };

  const updateList = async (list: TaskList) => {
    if (!boardId || !ws) return;

    const res = await fetch(
      `/api/workspaces/${ws.id}/boards/${boardId}/lists/${list.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: list.name,
        }),
      }
    );

    if (res.ok)
      await mutate(`/api/workspaces/${ws.id}/boards/${boardId}/lists`);
  };

  const showEditListModal = (list?: TaskList) => {
    openModal({
      title: list ? 'Edit list' : 'New list',
      centered: true,
      children: (
        <TaskListEditForm list={list} onSubmit={list ? updateList : addList} />
      ),
    });
  };

  return (
    <>
      {board && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="flex w-full items-center gap-4 text-xl font-semibold">
              {board?.name || 'Untitled Board'}
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="border border-blue-300/10 bg-blue-300/10 text-blue-300 hover:bg-blue-300/20"
                onClick={() => showEditListModal()}
                disabled={!boardId}
              >
                New task list
              </Button>

              <SegmentedControl
                value={mode}
                onChange={setMode}
                data={[
                  {
                    label: (
                      <div className="flex items-center gap-2">
                        <QueueListIcon className="inline-block h-5" /> List
                      </div>
                    ),
                    value: 'list',
                  },
                  {
                    label: (
                      <div className="flex items-center gap-2">
                        <ViewColumnsIcon className="inline-block h-5" /> Board
                      </div>
                    ),
                    value: 'board',
                    disabled: true,
                  },
                ]}
              />

              <Menu>
                <Menu.Target>
                  <ActionIcon
                    size="xl"
                    className="bg-zinc-300/10 text-zinc-300 hover:bg-zinc-300/20 hover:text-zinc-100"
                  >
                    <EllipsisHorizontalIcon className="w-5" />
                  </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown className="font-semibold">
                  <Menu.Item disabled>Archived Lists</Menu.Item>
                  <Menu.Item onClick={() => showEditBoardModal(board)}>
                    Board Settings
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    onClick={() => showDeleteBoardModal(board)}
                  >
                    Delete Board
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          </div>

          <Divider className="my-2" />
        </>
      )}

      <div className="relative mt-4 flex h-full w-full flex-col">
        {isContentLoading ? (
          <div className="flex h-full items-center justify-center overflow-auto p-8 text-center text-xl font-semibold text-zinc-400/80">
            <Loader />
          </div>
        ) : lists?.length === 0 ? (
          <div className="flex h-full items-center justify-center overflow-auto p-8 text-center text-xl font-semibold text-zinc-400/80">
            Create a task list to get started
          </div>
        ) : (
          <Accordion
            value={selectedListId}
            onChange={(id) => {
              setSelectedListId((prevId) => {
                if (prevId === id) return null;
                return id;
              });

              // If the list is being collapsed, don't mutate
              if (!ws || !id || selectedListId === id) return;

              const query = buildQuery(ws.id, id);
              mutate(query);
            }}
            className="grid gap-4 border-transparent"
            classNames={{
              item: 'border bg-zinc-300/5 border-zinc-300/10 rounded',
              content: 'mt-2',
            }}
          >
            {ws &&
              boardId &&
              lists?.map((list) => (
                <TaskListWrapper
                  key={list.id}
                  ws={ws}
                  boardId={boardId as string}
                  list={list}
                />
              ))}
          </Accordion>
        )}
      </div>
    </>
  );
}
