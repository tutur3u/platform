import {
  HomeIcon as HomeIconSolid,
  CalendarDaysIcon as CalendarIconSolid,
  CheckCircleIcon as TasksIconSolid,
  ClipboardDocumentListIcon as NotesIconSolid,
  BanknotesIcon as MoneyIconSolid,
  UserGroupIcon as UsersIconSolid,
  Cog6ToothIcon as SettingsIconSolid,
  PlusIcon as PlusIconSolid,
  ArchiveBoxIcon,
} from '@heroicons/react/24/solid';

import {
  HomeIcon as HomeIconOutline,
  CalendarDaysIcon as CalendarIconOutline,
  CheckCircleIcon as TasksIconOutline,
  ClipboardDocumentListIcon as NotesIconOutline,
  BanknotesIcon as MoneyIconOutline,
  UserGroupIcon as UsersIconOutline,
  Cog6ToothIcon as SettingsIconOutline,
  FolderPlusIcon,
  SquaresPlusIcon,
  EllipsisHorizontalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

import SidebarTab from './SidebarTab';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import {
  Accordion,
  Avatar,
  Chip,
  Indicator,
  Loader,
  Menu,
  Select,
  Tooltip,
} from '@mantine/core';
import { useUserData } from '../../hooks/useUserData';
import SidebarDivider from './SidebarDivider';
import { useOrgs } from '../../hooks/useOrganizations';
import OrgEditForm from '../forms/OrgEditForm';
import { openConfirmModal, openModal } from '@mantine/modals';
import { Organization } from '../../types/primitives/Organization';
import Link from 'next/link';
import { getInitials } from '../../utils/name-helper';
import { useEffect, useState } from 'react';
import { TaskBoard } from '../../types/primitives/TaskBoard';
import BoardEditForm from '../forms/BoardEditForm';
import useSWR, { mutate } from 'swr';
import { TaskList } from '../../types/primitives/TaskList';
import TaskListEditForm from '../forms/TaskListEditForm';
import TaskListWrapper from '../tasks/lists/TaskListWrapper';
import { Task } from '../../types/primitives/Task';
import TaskWrapper from '../tasks/core/TaskWrapper';

function LeftSidebar({ className }: SidebarProps) {
  const { leftSidebarPref, changeLeftSidebarMainPref } = useAppearance();
  const { data: user } = useUserData();

  useEffect(() => {
    if (!user) mutate('/api/user');
  }, [user]);

  const { isLoading: isOrgsLoading, orgs, createOrg } = useOrgs();

  const addOrg = (org: Organization) => createOrg(org);

  const showEditOrgModal = () => {
    openModal({
      title: 'New organization',
      centered: true,
      children: <OrgEditForm onSubmit={addOrg} />,
    });
  };

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

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <>
      <div
        className={`${className} group fixed top-0 left-0 z-20 flex h-full items-start justify-start bg-zinc-900 backdrop-blur-lg transition-all duration-300`}
      >
        <div
          className={`flex h-full w-16 flex-col border-r border-zinc-800/80 pt-6 pb-2 ${
            leftSidebarPref.main === 'open' &&
            leftSidebarPref.secondary === 'visible'
              ? 'opacity-100'
              : leftSidebarPref.main === 'open'
              ? 'w-64 opacity-100'
              : leftSidebarPref.secondary === 'visible'
              ? 'opacity-100'
              : 'pointer-events-none opacity-0 md:pointer-events-auto md:static md:opacity-100'
          } transition-all`}
        >
          <div className="relative mx-3 flex justify-start pl-[0.2rem] pb-1">
            <Logo
              alwaysShowLabel={leftSidebarPref.main === 'open'}
              showLabel={
                leftSidebarPref.main !== 'closed' &&
                leftSidebarPref.secondary === 'hidden'
              }
            />
          </div>

          <div className="h-8" />

          <div className="h-full overflow-auto">
            <div className="flex flex-col items-start gap-6 p-4">
              <SidebarTab
                href="/"
                activeIcon={<HomeIconSolid className="w-8" />}
                inactiveIcon={<HomeIconOutline className="w-8" />}
                label="Home"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              <SidebarTab
                href="/calendar"
                activeIcon={<CalendarIconSolid className="w-8" />}
                inactiveIcon={<CalendarIconOutline className="w-8" />}
                label="Calendar"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              <SidebarTab
                href="/tasks"
                activeIcon={<TasksIconSolid className="w-8" />}
                inactiveIcon={<TasksIconOutline className="w-8" />}
                label="Tasks"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              {isDev && (
                <SidebarTab
                  href="/notes"
                  activeIcon={<NotesIconSolid className="w-8" />}
                  inactiveIcon={<NotesIconOutline className="w-8" />}
                  label="Notes"
                  showTooltip={leftSidebarPref.main === 'closed'}
                />
              )}
              {isDev && (
                <SidebarTab
                  href="/expenses"
                  activeIcon={<MoneyIconSolid className="w-8" />}
                  inactiveIcon={<MoneyIconOutline className="w-8" />}
                  label="Expenses"
                  showTooltip={leftSidebarPref.main === 'closed'}
                />
              )}
              {isDev && (
                <SidebarTab
                  href="/friends"
                  activeIcon={<UsersIconSolid className="w-8" />}
                  inactiveIcon={<UsersIconOutline className="w-8" />}
                  label="Friends"
                  showTooltip={leftSidebarPref.main === 'closed'}
                />
              )}
            </div>

            {orgs?.current?.length > 0 && <SidebarDivider />}

            {isOrgsLoading || (
              <div className="flex flex-col gap-3 p-4">
                {orgs?.current?.map((org) => (
                  <SidebarTab
                    key={org.id}
                    href={`/orgs/${org.id}`}
                    inactiveIcon={
                      <div className="rounded border border-blue-300/30 transition hover:border-blue-300/40 hover:bg-zinc-300/10">
                        <Avatar color="blue" radius="sm">
                          {getInitials(org?.name ?? 'Unknown')}
                        </Avatar>
                      </div>
                    }
                    label={org.name}
                    showTooltip={leftSidebarPref.main === 'closed'}
                    enableOffset
                  />
                ))}

                <SidebarTab
                  onClick={showEditOrgModal}
                  activeIcon={
                    <div className="rounded border border-zinc-700 p-0.5 transition hover:border-purple-300/20 hover:bg-purple-300/20 hover:text-purple-300">
                      <PlusIconSolid className="w-8" />
                    </div>
                  }
                  label="New Organization"
                  showTooltip={leftSidebarPref.main === 'closed'}
                  className={
                    leftSidebarPref.main === 'closed'
                      ? 'translate-x-[-0.03rem]'
                      : 'translate-x-[-0.22rem]'
                  }
                />
              </div>
            )}

            <SidebarDivider />
          </div>

          <div className="flex flex-col items-start gap-3 px-4 pb-2">
            <SidebarTab
              href="/settings"
              activeIcon={<SettingsIconSolid className="w-8" />}
              inactiveIcon={<SettingsIconOutline className="w-8" />}
              label="Settings"
              showTooltip={leftSidebarPref.main === 'closed'}
            />

            <Link
              href={user?.username ? `/${user.username}` : '/settings'}
              className={`${
                leftSidebarPref.main !== 'closed'
                  ? '-translate-x-1 justify-start'
                  : 'justify-center self-center'
              } relative flex w-full items-center transition duration-300`}
            >
              <Tooltip
                label={
                  <div className="font-semibold">
                    <div>{user?.displayName || user?.email}</div>
                    {user?.username && (
                      <div className="text-blue-300">@{user.username}</div>
                    )}
                  </div>
                }
                disabled={leftSidebarPref.main !== 'closed'}
                position="right"
                color="#182a3d"
                offset={20}
                withArrow
              >
                <div className="flex items-end gap-2">
                  <Indicator
                    color="green"
                    position="bottom-end"
                    size={12}
                    offset={5}
                    withBorder
                  >
                    <Avatar color="blue" radius="xl">
                      {getInitials(user?.displayName || user?.email)}
                    </Avatar>
                  </Indicator>

                  <div
                    className={
                      leftSidebarPref.main === 'closed' ||
                      leftSidebarPref.secondary === 'visible'
                        ? 'hidden'
                        : leftSidebarPref.main === 'auto'
                        ? 'opacity-0 transition duration-300 group-hover:opacity-100'
                        : ''
                    }
                  >
                    <div className="text-md min-w-max font-bold">
                      {user?.displayName ||
                        user?.email ||
                        user?.phone ||
                        'Not logged in'}
                    </div>
                    {user?.username && (
                      <div className="min-w-max text-sm font-semibold text-blue-300">
                        @{user?.username}
                      </div>
                    )}
                  </div>
                </div>
              </Tooltip>
            </Link>
          </div>
        </div>

        {leftSidebarPref.secondary === 'visible' &&
          (isBoardsLoading ? (
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
                          label: board.name || 'Untitled',
                          group:
                            user?.displayName ||
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
                          <PlusIconSolid className="w-6" />
                        </button>
                      </Menu.Target>

                      <Menu.Dropdown>
                        <Menu.Item
                          icon={<SquaresPlusIcon className="w-6" />}
                          onClick={() => showEditBoardModal()}
                        >
                          New board
                        </Menu.Item>

                        <Menu.Item
                          icon={<FolderPlusIcon className="w-6" />}
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
                        <EllipsisHorizontalIcon className="w-6" />
                      </button>
                    </Menu.Target>

                    <Menu.Dropdown>
                      <Menu.Item
                        icon={<ArchiveBoxIcon className="w-6" />}
                        disabled
                      >
                        Archived lists
                      </Menu.Item>
                      <Menu.Item
                        icon={<SettingsIconSolid className="w-6" />}
                        onClick={() =>
                          showEditBoardModal(getBoard(selectedBoardId))
                        }
                      >
                        Board settings
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        icon={<TrashIcon className="w-6" />}
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
          ))}
      </div>

      <div
        className={`z-10 h-screen w-screen bg-zinc-900/50 backdrop-blur md:hidden ${
          leftSidebarPref.main === 'open' ? 'block' : 'hidden'
        }`}
        onClick={() => changeLeftSidebarMainPref('closed')}
      />
    </>
  );
}

export default LeftSidebar;
