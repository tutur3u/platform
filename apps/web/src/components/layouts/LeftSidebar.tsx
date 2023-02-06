import {
  HomeIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  PlusIcon,
  ArchiveBoxIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  BuildingOffice2Icon,
  Squares2X2Icon,
  UserPlusIcon,
} from '@heroicons/react/24/solid';

import {
  FolderPlusIcon,
  SquaresPlusIcon,
  EllipsisHorizontalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

import SidebarLink from './SidebarLink';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import {
  Accordion,
  Avatar,
  Chip,
  Divider,
  Loader,
  Menu,
  Popover,
  Select,
  Tooltip,
} from '@mantine/core';
import { useUserData } from '../../hooks/useUserData';
import SidebarDivider from './SidebarDivider';
import { useOrgs } from '../../hooks/useOrganizations';
import OrgEditForm from '../forms/OrgEditForm';
import { openConfirmModal, openModal } from '@mantine/modals';
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
import SidebarButton from './SidebarButton';
import OrganizationSelector from '../selectors/OrganizationSelector';
import { useProjects } from '../../hooks/useProjects';
import ProjectEditForm from '../forms/ProjectEditForm';
import Link from 'next/link';

function LeftSidebar({ className }: SidebarProps) {
  const { leftSidebarPref, changeLeftSidebarMainPref } = useAppearance();
  const { data: user } = useUserData();

  useEffect(() => {
    if (!user) mutate('/api/user');
  }, [user]);

  const { createOrg } = useOrgs();
  const {
    orgId,
    org,
    members,
    isOrgLoading,
    isMembersLoading,
    isProjectsLoading,
    createProject,
    projects,
  } = useProjects();

  const showEditOrgModal = () => {
    openModal({
      title: <div className="font-semibold">New organization</div>,
      centered: true,
      children: <OrgEditForm onSubmit={createOrg} />,
    });
  };

  const showProjectEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new project</div>,
      centered: true,
      children: <ProjectEditForm onSubmit={createProject} />,
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

  const [userPopover, setUserPopover] = useState(false);
  const [newPopover, setNewPopover] = useState(false);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setIsMobile(window.innerWidth < 768);
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  return (
    <>
      <div
        className={`${className} group fixed top-0 left-0 z-20 flex h-full items-start justify-start bg-zinc-900 backdrop-blur-lg transition-all duration-300`}
      >
        <div
          className={`flex h-full w-16 flex-col border-r border-zinc-800/80 pt-4 pb-2 ${
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
          <div className="relative mx-4 mb-2 flex justify-start pb-1">
            <Logo
              alwaysShowLabel={leftSidebarPref.main === 'open'}
              showLabel={
                leftSidebarPref.main !== 'closed' &&
                leftSidebarPref.secondary === 'hidden'
              }
            />
          </div>

          <Divider className="my-2" />
          <Popover
            opened={newPopover}
            onChange={setNewPopover}
            width={200}
            offset={16}
            position={isMobile ? 'bottom-start' : 'right'}
            positionDependencies={[isMobile]}
          >
            <Popover.Target>
              <div className="mx-2">
                <SidebarButton
                  label="New"
                  onClick={() => setNewPopover((o) => !o)}
                  isActive={newPopover}
                  activeIcon={<PlusIcon className="w-5" />}
                  showLabel={leftSidebarPref.main === 'open'}
                  showTooltip={leftSidebarPref.main === 'closed' && !newPopover}
                  className="w-full"
                />
              </div>
            </Popover.Target>

            <Popover.Dropdown className="mt-2 grid gap-1 p-1">
              <SidebarButton
                onClick={() => {
                  setNewPopover(false);
                  showEditOrgModal();
                }}
                activeIcon={<BuildingOffice2Icon className="w-5" />}
                label="New organization"
                left
              />
              <SidebarButton
                onClick={() => {
                  setNewPopover(false);
                  showProjectEditForm();
                }}
                activeIcon={<Squares2X2Icon className="w-5" />}
                label="New project"
                left
              />
              <SidebarButton
                onClick={() => setNewPopover(false)}
                activeIcon={<CheckCircleIcon className="w-5" />}
                label="New task"
                left
                disabled
              />
              <SidebarButton
                onClick={() => setNewPopover(false)}
                activeIcon={<ClipboardDocumentListIcon className="w-5" />}
                label="New note"
                left
                disabled
              />
              <SidebarButton
                onClick={() => setNewPopover(false)}
                activeIcon={<BanknotesIcon className="w-5" />}
                label="New transaction"
                left
                disabled
              />
              <Divider className="my-1" />
              <SidebarButton
                onClick={() => setNewPopover(false)}
                activeIcon={<UserPlusIcon className="w-5" />}
                label="Invite people"
                left
                disabled
              />
            </Popover.Dropdown>
          </Popover>

          <Divider />

          <div className="scrollbar-none my-2 h-full overflow-auto">
            <div className="m-2 flex flex-col gap-1">
              <SidebarLink
                href="/"
                onClick={() => setUserPopover(false)}
                activeIcon={<HomeIcon className="w-5" />}
                label="Home"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              <SidebarLink
                href="/calendar"
                onClick={() => setUserPopover(false)}
                activeIcon={<CalendarDaysIcon className="w-5" />}
                label="Calendar"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              <SidebarLink
                href="/tasks"
                onClick={() => setUserPopover(false)}
                activeIcon={<CheckCircleIcon className="w-5" />}
                label="Tasks"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              <SidebarLink
                href="/notes"
                onClick={() => setUserPopover(false)}
                activeIcon={<ClipboardDocumentListIcon className="w-5" />}
                label="Notes"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              <SidebarLink
                href="/expenses"
                onClick={() => setUserPopover(false)}
                activeIcon={<BanknotesIcon className="w-5" />}
                label="Expenses"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
            </div>

            <Divider />

            <div className="m-2">
              <Link href={`/orgs/${orgId}`}>
                <Tooltip
                  label={
                    <div>
                      <div className="font-semibold">
                        {org.name || 'Unnamed Organization'}
                      </div>
                      <div className="text-xs font-semibold">
                        {members.length}{' '}
                        {members.length === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                  }
                  position="right"
                  offset={16}
                  disabled={leftSidebarPref.main === 'open'}
                >
                  <div className="rounded border border-zinc-700/50 bg-zinc-800 p-2 transition hover:bg-zinc-700/60">
                    <div className="">
                      <div
                        className={`mb-1 flex ${
                          leftSidebarPref.main === 'closed'
                            ? 'items-center justify-center'
                            : 'justify-between gap-2 font-semibold'
                        }`}
                      >
                        <div className="line-clamp-1">
                          {leftSidebarPref.main === 'closed' ? (
                            <BuildingOffice2Icon className="w-5" />
                          ) : (
                            org?.name || 'Unnamed Organization'
                          )}
                        </div>

                        {leftSidebarPref.main === 'closed' || (
                          <div className="flex items-center rounded bg-blue-500/20 px-4 py-1 text-sm font-bold text-blue-300">
                            Free
                          </div>
                        )}
                      </div>
                    </div>

                    <Tooltip.Group>
                      <Avatar.Group
                        spacing="sm"
                        color="blue"
                        className={
                          leftSidebarPref.main === 'closed' ? 'hidden' : ''
                        }
                      >
                        {members &&
                          members.slice(0, 3).map((member) => (
                            <Tooltip
                              key={member.id}
                              label={
                                <div className="font-semibold">
                                  <div>
                                    {member?.display_name || member?.email}
                                  </div>
                                  {member?.username && (
                                    <div className="text-blue-300">
                                      @{member.username}
                                    </div>
                                  )}
                                </div>
                              }
                              color="#182a3d"
                            >
                              <Avatar color="blue" radius="xl">
                                {getInitials(
                                  member?.display_name || member?.email
                                )}
                              </Avatar>
                            </Tooltip>
                          ))}
                        <Tooltip
                          label={
                            <div className="font-semibold">Invite people</div>
                          }
                        >
                          <Avatar color="blue" radius="xl">
                            <UserPlusIcon className="w-5" />
                          </Avatar>
                        </Tooltip>
                      </Avatar.Group>
                    </Tooltip.Group>
                  </div>
                </Tooltip>
              </Link>

              <Divider variant="dashed" className="my-2" />

              {isProjectsLoading || (
                <div
                  className={`flex flex-col ${
                    leftSidebarPref.main === 'open' ? 'gap-1' : 'gap-2'
                  }`}
                >
                  {projects.length > 0 ? (
                    projects.map((project) => (
                      <SidebarLink
                        key={project.id}
                        href={`/projects/${project.id}`}
                        defaultHighlight={leftSidebarPref.main !== 'closed'}
                        activeIcon={
                          <Avatar
                            radius="sm"
                            color="blue"
                            className="bg-blue-500/20"
                            size={leftSidebarPref.main === 'open' ? 'sm' : 'md'}
                          >
                            {project?.name ? (
                              getInitials(project.name)
                            ) : (
                              <BuildingOffice2Icon className="w-5" />
                            )}
                          </Avatar>
                        }
                        inactiveIcon={
                          <Avatar
                            radius="sm"
                            color="blue"
                            className="hover:bg-blue-500/10"
                            size={leftSidebarPref.main === 'open' ? 'sm' : 'md'}
                          >
                            {project?.name ? (
                              getInitials(project.name)
                            ) : (
                              <BuildingOffice2Icon className="w-5" />
                            )}
                          </Avatar>
                        }
                        label={project?.name || 'Untitled Project'}
                        showTooltip={leftSidebarPref.main === 'closed'}
                      />
                    ))
                  ) : (
                    <SidebarButton
                      label="New project"
                      activeIcon={<SquaresPlusIcon className="w-5" />}
                      showLabel={leftSidebarPref.main === 'open'}
                      showTooltip={
                        leftSidebarPref.main === 'closed' && !newPopover
                      }
                      onClick={showProjectEditForm}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <Divider className="mb-2 hidden md:block" />
          <div className="mx-2 hidden md:block">
            <SidebarButton
              onClick={() =>
                changeLeftSidebarMainPref(
                  leftSidebarPref.main === 'closed' ? 'open' : 'closed'
                )
              }
              label={
                leftSidebarPref.main === 'closed'
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
              }
              activeIcon={
                leftSidebarPref.main === 'closed' ? (
                  <ChevronRightIcon className="w-5" />
                ) : (
                  <ChevronLeftIcon className="w-5" />
                )
              }
              showLabel={leftSidebarPref.main === 'open'}
              showTooltip={leftSidebarPref.main === 'closed'}
              className="w-full"
            />
          </div>
          <Divider className="my-2" variant="dashed" />

          <div className="mx-2 flex items-center justify-center gap-2">
            {leftSidebarPref.main === 'open' && <OrganizationSelector />}

            <Popover
              opened={userPopover}
              onChange={setUserPopover}
              width={200}
              offset={8}
              position="top-start"
            >
              <Popover.Target>
                <Tooltip
                  label={
                    <div className="font-semibold">
                      <div>{user?.displayName || user?.email}</div>
                      {user?.username && (
                        <div className="text-blue-300">@{user.username}</div>
                      )}
                    </div>
                  }
                  disabled={userPopover}
                  offset={leftSidebarPref.main === 'closed' ? 20 : 16}
                  position="right"
                  color="#182a3d"
                >
                  <Avatar
                    color="blue"
                    className={`cursor-pointer hover:bg-blue-500/10 ${
                      userPopover ? 'bg-blue-500/10' : ''
                    }`}
                    onClick={() => setUserPopover((o) => !o)}
                  >
                    {getInitials(user?.displayName || user?.email)}
                  </Avatar>
                </Tooltip>
              </Popover.Target>

              <Popover.Dropdown className="grid gap-1 p-1">
                <SidebarLink
                  href={user?.username ? `/${user.username}` : '/settings'}
                  onClick={() => setUserPopover(false)}
                  activeIcon={<UserCircleIcon className="w-5" />}
                  label="Profile"
                  defaultActive={false}
                  left
                />
                <SidebarLink
                  href="/settings"
                  onClick={() => setUserPopover(false)}
                  activeIcon={<Cog6ToothIcon className="w-5" />}
                  label="Settings"
                  defaultActive={false}
                  left
                />

                {leftSidebarPref.main !== 'open' && (
                  <>
                    <Divider className="my-1" variant="dashed" />
                    <OrganizationSelector
                      showLabel
                      className="mx-2 mb-2"
                      onChange={() => setUserPopover(false)}
                    />
                  </>
                )}
              </Popover.Dropdown>
            </Popover>
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
                          label: board.name || 'Untitled Board',
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
