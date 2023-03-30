import { useRouter } from 'next/router';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { ReactElement, useEffect, useState } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import {
  Accordion,
  Chip,
  Divider,
  Loader,
  Menu,
  SegmentedControl,
} from '@mantine/core';
import {
  ArchiveBoxIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  FolderPlusIcon,
  PlusIcon,
  QueueListIcon,
  TrashIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/solid';
import { openConfirmModal, openModal } from '@mantine/modals';
import HeaderX from '../../../components/metadata/HeaderX';
import { TaskBoard } from '../../../types/primitives/TaskBoard';
import { TaskList } from '../../../types/primitives/TaskList';
import SidebarDivider from '../../../components/layouts/SidebarDivider';
import { Task } from '../../../types/primitives/Task';
import BoardEditForm from '../../../components/forms/BoardEditForm';
import TaskListEditForm from '../../../components/forms/TaskListEditForm';
import TaskWrapper from '../../../components/tasks/core/TaskWrapper';
import TaskListWrapper from '../../../components/tasks/lists/TaskListWrapper';
import { useUser } from '../../../hooks/useUser';
import { useWorkspaces } from '../../../hooks/useWorkspaces';

const WorkspaceBoardEditor = () => {
  const router = useRouter();
  const { boardId } = router.query;

  const { ws } = useWorkspaces();

  const { data: board } = useSWR<TaskBoard>(
    ws && boardId ? `/api/workspaces/${ws.id}/boards/${boardId}` : null
  );

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws.name || 'Unnamed Workspace',
              href: `/${ws.id}`,
            },
            { content: 'Boards', href: `/${ws.id}/boards` },
            {
              content: board ? board?.name || 'Untitled Board' : 'Loading...',
              href: `/${ws.id}/boards/${boardId}`,
            },
          ]
        : []
    );
  }, [ws, boardId, board, setRootSegment]);

  const [mode, setMode] = useState('list');

  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const { user } = useUser();

  const [viewOption, setViewOption] = useState('my-tasks');

  const canFetchLists = user?.id && boardId && viewOption === 'all';

  const { data: lists, error: listsError } = useSWR<TaskList[] | null>(
    canFetchLists && ws
      ? `/api/workspaces/${ws.id}/boards/${boardId}/lists`
      : null
  );

  const [listViewOptions, setListViewOption] = useState<
    {
      id: string;
      option: string;
    }[]
  >([]);

  const getViewOptionForList = (listId: string) => {
    const data = listViewOptions.find((o) => o.id === listId);
    return data?.option || 'todos';
  };

  const setViewOptionForList = (listId: string, option: string) => {
    setListViewOption((prev) => {
      // If the option is already set, update it
      const existing = prev.find((o) => o.id === listId);
      if (existing) {
        existing.option = option;
        return [...prev];
      } else {
        // Otherwise, add a new option
        return [...prev, { id: listId, option }];
      }
    });
  };

  const buildQuery = (wsId: string, listId: string, option: string) => {
    let query = `/api/workspaces/${wsId}/boards/${boardId}/lists/${listId}/tasks`;

    if (option === 'todos') query += '&todos=true';
    if (option === 'completed') query += '&completed=true';

    return query;
  };

  const canFetchTasks =
    user?.id && boardId && selectedListId && viewOption !== 'all';
  const { data: tasks, error: tasksError } = useSWR<Task[] | null>(
    canFetchTasks && ws
      ? `/api/workspaces/${ws.id}/boards/${boardId}/lists/${selectedListId}/tasks?option=${viewOption}`
      : null
  );

  const isListsLoading = !lists && !listsError && canFetchLists;
  const isTasksLoading = !tasks && !tasksError && canFetchTasks;

  const isContentLoading = isListsLoading || isTasksLoading;

  const deleteBoard = async () => {
    if (!boardId || !ws) return;

    openConfirmModal({
      title: <div className="font-semibold">Delete Board</div>,
      children: 'Are you sure you want to delete this board?',
      labels: {
        confirm: 'Delete',
        cancel: 'Cancel',
      },
      centered: true,
      onConfirm: () => {
        fetch(`/api/workspaces/${ws.id}/boards/${boardId}`, {
          method: 'DELETE',
        })
          .then((res) => res.json())
          .then(() => router.push(`/${ws.id}/boards`));
      },
    });
  };

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
      mutate(`/api/workspaces/${ws.id}/boards/${boardId}`);
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
    if (!board) return;
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
          <p className="text-sm text-zinc-500">
            All of your data will be permanently removed. This action cannot be
            undone.
          </p>
        </div>
      ),
      onConfirm: () => deleteBoard(),
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

    if (res.ok) mutate(`/api/workspaces/${ws.id}/boards/${boardId}/lists`);
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

    if (res.ok) mutate(`/api/workspaces/${ws.id}/boards/${boardId}/lists`);
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
      <HeaderX
        label={`${board?.name || 'Untitled Board'} - ${
          ws?.name || 'Untitled Workspace'
        }`}
      />

      {board && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="flex w-full items-center gap-4">
              {board?.name || 'Untitled Board'}
            </div>

            <Menu openDelay={100} closeDelay={400} withArrow>
              <Menu.Target>
                <button className="h-fit rounded-lg bg-zinc-300/10 p-2 text-zinc-300 hover:bg-zinc-300/20 hover:text-zinc-100">
                  <EllipsisHorizontalIcon className="w-5" />
                </button>
              </Menu.Target>

              <Menu.Dropdown className="font-semibold">
                <Menu.Item icon={<ArchiveBoxIcon className="w-5" />} disabled>
                  Archived lists
                </Menu.Item>
                <Menu.Item
                  icon={<Cog6ToothIcon className="w-5" />}
                  onClick={() => showEditBoardModal(board)}
                >
                  Board settings
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  icon={<TrashIcon className="w-5" />}
                  color="red"
                  onClick={() => showDeleteBoardModal(board)}
                >
                  Delete board
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>

          <Divider variant="dashed" className="my-2" />

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
            className="mb-2"
          />
        </>
      )}

      <div className="relative flex h-full w-full flex-col border-r border-zinc-800/80 pt-2">
        <div className="relative mx-2 flex gap-2 text-2xl font-semibold">
          <div className="flex items-center gap-1">
            {boardId && (
              <Menu openDelay={100} closeDelay={400} withArrow>
                <Menu.Target>
                  <button className="h-fit rounded border border-transparent transition hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300">
                    <PlusIcon className="w-5" />
                  </button>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Item
                    icon={<FolderPlusIcon className="w-5" />}
                    onClick={() => showEditListModal()}
                  >
                    New task list
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </div>
        </div>

        <SidebarDivider padBottom={false} padLeft={false} padRight={false} />

        <Chip.Group
          multiple={false}
          value={viewOption}
          onChange={setViewOption}
        >
          <div className="mt-2 flex flex-wrap justify-center gap-2 border-b border-zinc-800/80 pb-2">
            <Chip variant="filled" value="all">
              All
            </Chip>
            <Chip color="cyan" variant="filled" value="my-tasks">
              My tasks
            </Chip>
            <Chip color="teal" variant="filled" value="recently-updated">
              Recently added
            </Chip>
          </div>
        </Chip.Group>

        {isContentLoading ? (
          <div className="flex h-full items-center justify-center overflow-auto p-8 text-center text-xl font-semibold text-zinc-400/80">
            <Loader />
          </div>
        ) : viewOption !== 'all' ? (
          !tasks || tasks.length === 0 ? (
            <div className="flex h-full items-center justify-center overflow-auto p-8 text-center text-xl font-semibold text-zinc-400/80">
              You have no assigned tasks in this board.
            </div>
          ) : (
            <div className="scrollbar-none flex flex-col gap-2 overflow-auto p-4">
              {boardId &&
                selectedListId &&
                tasks.map((task) => (
                  <TaskWrapper
                    key={task.id}
                    task={task}
                    listId={selectedListId}
                    highlight={viewOption !== 'my-tasks'}
                    onUpdated={() =>
                      mutate(
                        `/api/tasks?boardId=${boardId}&option=${viewOption}`
                      )
                    }
                  />
                ))}
            </div>
          )
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

              const option = getViewOptionForList(id);
              const query = buildQuery(ws.id, id, option);
              mutate(query);
            }}
            chevronPosition="left"
            radius="lg"
            className="scrollbar-none flex flex-col overflow-auto"
          >
            {ws &&
              boardId &&
              lists?.map((list) => (
                <TaskListWrapper
                  key={list.id}
                  ws={ws}
                  boardId={boardId as string}
                  list={list}
                  option={getViewOptionForList(list.id)}
                  setOption={(option) => setViewOptionForList(list.id, option)}
                />
              ))}
          </Accordion>
        )}
      </div>
    </>
  );
};

WorkspaceBoardEditor.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default WorkspaceBoardEditor;
