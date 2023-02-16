import { ReactElement, useEffect, useState } from 'react';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import HeaderX from '../../components/metadata/HeaderX';
import { DEV_MODE } from '../../constants/common';
import Calendar from '../../components/calendar/Calendar';
import TaskListEditForm from '../../components/forms/TaskListEditForm';
import { openConfirmModal, openModal } from '@mantine/modals';
import { TaskList } from '../../types/primitives/TaskList';
import { TaskBoard } from '../../types/primitives/TaskBoard';
import BoardEditForm from '../../components/forms/BoardEditForm';
import useSWR, { mutate } from 'swr';
import { Task } from '../../types/primitives/Task';
import { Accordion, Chip, Loader, Menu, Select } from '@mantine/core';
import {
  ArchiveBoxIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  FolderPlusIcon,
  PlusIcon,
  SquaresPlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import SidebarDivider from '../../components/layouts/SidebarDivider';
import TaskWrapper from '../../components/tasks/core/TaskWrapper';
import TaskListWrapper from '../../components/tasks/lists/TaskListWrapper';
import SidebarLayout from '../../components/layouts/SidebarLayout';

const CalendarPage: PageWithLayoutProps = () => {
  const {
    setRootSegment,
    changeLeftSidebarSecondaryPref,
    changeRightSidebarPref,
  } = useAppearance();
  const { updateUsers } = useUserList();
  const { data: user } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');
    setRootSegment({
      content: 'Calendar',
      href: '/calendar',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) updateUsers([user]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const { data: boards, error: boardsError } = useSWR<TaskBoard[] | null>(
    user?.id ? '/api/tasks/boards' : null
  );

  const [viewOption, setViewOption] = useState('my-tasks');

  const { data: lists, error: listsError } = useSWR<TaskList[] | null>(
    user?.id && selectedBoardId && viewOption === 'all'
      ? `/api/tasks/lists?boardId=${selectedBoardId}`
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

  const buildQuery = (listId: string, option: string) => {
    let query = `/api/tasks?listId=${listId}`;

    if (option === 'todos') query += '&todos=true';
    if (option === 'completed') query += '&completed=true';

    return query;
  };

  const { data: tasks, error: tasksError } = useSWR<Task[] | null>(
    user?.id && selectedBoardId && viewOption !== 'all'
      ? `/api/tasks?boardId=${selectedBoardId}&option=${viewOption}`
      : null
  );

  const isBoardsLoading = !boards && !boardsError;
  const isListsLoading = !lists && !listsError && viewOption === 'all';
  const isTasksLoading = !tasks && !tasksError && viewOption !== 'all';

  const isContentLoading = isBoardsLoading || isListsLoading || isTasksLoading;

  // Automatically select the first board if none is selected
  useEffect(() => {
    const boardsSelected = !!selectedBoardId;

    if (!boards || boards.length === 0) {
      setSelectedBoardId(null);
      return;
    }

    const firstBoardId = boards[0].id;
    if (!boardsSelected) setSelectedBoardId(firstBoardId);
  }, [boards, boards?.length, selectedBoardId]);

  const addBoard = async (board: TaskBoard) => {
    const res = await fetch('/api/tasks/boards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: board.name,
      }),
    });

    if (res.ok) {
      mutate('/api/tasks/boards');
      const newBoard = await res.json();
      setSelectedBoardId(newBoard.id);
    }
  };

  const updateBoard = async (board: TaskBoard) => {
    const res = await fetch(`/api/tasks/boards/${board.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: board.name,
      }),
    });

    if (res.ok) {
      mutate('/api/tasks/boards');
    }
  };

  const deleteBoard = async (board: TaskBoard) => {
    const res = await fetch(`/api/tasks/boards/${board.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      mutate('/api/tasks/boards');
      setSelectedBoardId(null);
    }
  };

  const showEditBoardModal = (board?: TaskBoard) => {
    openModal({
      title: board ? 'Edit board' : 'New board',
      centered: true,
      children: (
        <BoardEditForm
          board={board}
          onSubmit={board ? updateBoard : addBoard}
        />
      ),
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
      onConfirm: () => deleteBoard(board),
      closeOnConfirm: true,
      labels: {
        confirm: 'Delete',
        cancel: 'Cancel',
      },
    });
  };

  const addList = async (list: TaskList) => {
    if (!selectedBoardId) return;

    const res = await fetch('/api/tasks/lists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: list.name,
        boardId: selectedBoardId,
      }),
    });

    if (res.ok) mutate(`/api/tasks/lists?boardId=${selectedBoardId}`);
  };

  const updateList = async (list: TaskList) => {
    if (!selectedBoardId) return;

    const res = await fetch(`/api/tasks/lists/${list.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: list.name,
      }),
    });

    if (res.ok) mutate(`/api/tasks/lists?boardId=${selectedBoardId}`);
  };

  const showEditListModal = (boardId: string, list?: TaskList) => {
    openModal({
      title: list ? 'Edit list' : 'New list',
      centered: true,
      children: (
        <TaskListEditForm list={list} onSubmit={list ? updateList : addList} />
      ),
    });
  };

  const getBoard = (id?: string | null) =>
    boards?.find((b) => b.id === id) || boards?.[0];

  if (!DEV_MODE)
    return (
      <>
        <HeaderX label="Calendar" />
        <div className="p-4 md:h-screen md:p-8">
          <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
            Under construction 🚧
          </div>
        </div>
      </>
    );

  return (
    <>
      <HeaderX label="Calendar" />
      <div>
        {isBoardsLoading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 border-r border-zinc-800/80 p-8 text-center">
            <Loader />
          </div>
        ) : !boards || boards?.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 border-r border-zinc-800/80 p-8 text-center">
            <div className="text-lg font-semibold">
              Start organizing your tasks in a miraculous way.
            </div>
            <button
              onClick={() => showEditBoardModal()}
              className="rounded-lg bg-purple-300/20 px-4 py-2 text-lg font-semibold text-purple-300 transition hover:bg-purple-300/30"
            >
              Create a board
            </button>
          </div>
        ) : (
          <div className="relative flex h-full w-full flex-col border-r border-zinc-800/80 pt-2">
            <div className="relative mx-2 flex gap-2 text-2xl font-semibold">
              <Select
                defaultValue={selectedBoardId || boards?.[0]?.id}
                data={
                  boards
                    ? boards.map((board: TaskBoard) => ({
                        value: board.id,
                        label: board.name || 'Untitled Board',
                        group:
                          user?.display_name ||
                          user?.username ||
                          user?.email ||
                          'Unknown',
                      }))
                    : []
                }
                value={
                  boards.some((board) => board.id === selectedBoardId)
                    ? selectedBoardId
                    : boards?.[0]?.id
                }
                onChange={setSelectedBoardId}
                className="w-full"
              />
              <div className="flex items-center gap-1">
                {selectedBoardId && (
                  <Menu openDelay={100} closeDelay={400} withArrow>
                    <Menu.Target>
                      <button className="h-fit rounded border border-transparent transition hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300">
                        <PlusIcon className="w-5" />
                      </button>
                    </Menu.Target>

                    <Menu.Dropdown>
                      <Menu.Item
                        icon={<SquaresPlusIcon className="w-5" />}
                        onClick={() => showEditBoardModal()}
                      >
                        New board
                      </Menu.Item>

                      <Menu.Item
                        icon={<FolderPlusIcon className="w-5" />}
                        onClick={() => showEditListModal(selectedBoardId)}
                      >
                        New task list
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}

                <Menu openDelay={100} closeDelay={400} withArrow>
                  <Menu.Target>
                    <button className="h-fit rounded border border-transparent transition hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300">
                      <EllipsisHorizontalIcon className="w-5" />
                    </button>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Item
                      icon={<ArchiveBoxIcon className="w-5" />}
                      disabled
                    >
                      Archived lists
                    </Menu.Item>
                    <Menu.Item
                      icon={<Cog6ToothIcon className="w-5" />}
                      onClick={() =>
                        showEditBoardModal(getBoard(selectedBoardId))
                      }
                    >
                      Board settings
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      icon={<TrashIcon className="w-5" />}
                      color="red"
                      onClick={() =>
                        showDeleteBoardModal(getBoard(selectedBoardId))
                      }
                    >
                      Delete board
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            </div>

            <SidebarDivider
              padBottom={false}
              padLeft={false}
              padRight={false}
            />

            <Chip.Group
              multiple={false}
              value={viewOption}
              onChange={setViewOption}
              className="mt-2 flex flex-wrap justify-center gap-2 border-b border-zinc-800/80 pb-2"
            >
              <Chip variant="filled" value="all">
                All
              </Chip>
              <Chip color="cyan" variant="filled" value="my-tasks">
                My tasks
              </Chip>
              <Chip color="teal" variant="filled" value="recently-updated">
                Recently added
              </Chip>
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
                  {tasks.map((task) => (
                    <TaskWrapper
                      key={task.id}
                      task={task}
                      highlight={viewOption !== 'my-tasks'}
                      onUpdated={() =>
                        mutate(
                          `/api/tasks?boardId=${selectedBoardId}&option=${viewOption}`
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
                  if (!id || selectedListId === id) return;

                  const option = getViewOptionForList(id);
                  const query = buildQuery(id, option);
                  mutate(query);
                }}
                chevronPosition="left"
                radius="lg"
                className="scrollbar-none flex flex-col overflow-auto"
              >
                {lists?.map((list) => (
                  <TaskListWrapper
                    key={list.id}
                    list={list}
                    option={getViewOptionForList(list.id)}
                    setOption={(option) =>
                      setViewOptionForList(list.id, option)
                    }
                  />
                ))}
              </Accordion>
            )}
          </div>
        )}
        <Calendar />
      </div>
    </>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default CalendarPage;
