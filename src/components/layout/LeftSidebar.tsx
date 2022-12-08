import {
  BanknotesIcon as MoneyIconSolid,
  CalendarDaysIcon as CalendarIconSolid,
  ClipboardDocumentListIcon as TaskIconSolid,
  Cog6ToothIcon as SettingsIconSolid,
  HomeIcon as HomeIconSolid,
  PlusIcon as PlusIconSolid,
} from '@heroicons/react/24/solid';

import {
  BanknotesIcon as MoneyIconOutline,
  CalendarDaysIcon as CalendarIconOutline,
  ClipboardDocumentListIcon as TaskIconOutline,
  Cog6ToothIcon as SettingsIconOutline,
  HomeIcon as HomeIconOutline,
  FolderPlusIcon,
  SquaresPlusIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';

import SidebarTab from './SidebarTab';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import { Avatar, Checkbox, Indicator, Select, Tooltip } from '@mantine/core';
import { useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';
import SidebarDivider from './SidebarDivider';
import { useOrgs } from '../../hooks/useOrganizations';
import OrgEditForm from '../forms/OrgEditForm';
import { openModal } from '@mantine/modals';
import { Organization } from '../../types/primitives/Organization';
import Link from 'next/link';
import { getInitials } from '../../utils/name-helper';
import TaskEditForm from '../forms/TaskEditForm';
import { Task } from '../../types/primitives/Task';
import { useState } from 'react';
import { TaskBoard } from '../../types/primitives/TaskBoard';
import BoardEditForm from '../forms/BoardEditForm';

function LeftSidebar({ className }: SidebarProps) {
  const { leftSidebarPref, changeLeftSidebarPref } = useAppearance();
  const user = useUser();
  const { data } = useUserData();

  const { isLoading, orgs, createOrg } = useOrgs();

  const addOrg = (org: Organization) => createOrg(org);

  const showEditOrgModal = () => {
    openModal({
      title: 'New organization',
      centered: true,
      children: <OrgEditForm onSubmit={addOrg} />,
    });
  };

  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<TaskBoard | null>(null);

  const addTask = (task: Task, board: TaskBoard) => {
    setBoards((prev) => {
      const newBoards = [...prev];
      const boardIndex = newBoards.findIndex((b) => b.id === board.id);
      newBoards[boardIndex].tasks = [
        ...(newBoards[boardIndex]?.tasks || []),
        task,
      ];
      return newBoards;
    });
  };

  const addBoard = (board: TaskBoard) => {
    if (!selectedBoard) setSelectedBoard(board);
    setBoards((prev) => [...prev, board]);
  };

  const showEditTaskModal = (board: TaskBoard) => {
    openModal({
      title: 'New task',
      centered: true,
      children: <TaskEditForm onSubmit={(task) => addTask(task, board)} />,
    });
  };

  const showEditBoardModal = () => {
    openModal({
      title: 'New board',
      centered: true,
      children: <BoardEditForm onSubmit={addBoard} />,
    });
  };

  const [generated, setGenerated] = useState(false);

  const generateMeetingChecklist = () => {
    const newBoard = {
      id: 'meeting',
      name: 'Meeting Checklist',
      tasks: [
        {
          id: 'meeting-1',
          name: 'Prepare meeting',
          completed: true,
        },
        {
          id: 'meeting-2',
          name: 'Start meeting',
          completed: true,
        },
        {
          id: 'meeting-3',
          name: 'Introduce task boards',
          completed: false,
        },
        {
          id: 'meeting-4',
          name: 'Showcase boards, lists, and tasks creation buttons',
          completed: false,
        },
        {
          id: 'meeting-5',
          name: 'Hand over to Thu',
          completed: false,
        },
        {
          id: 'meeting-6',
          name: 'End meeting',
          completed: false,
        },
      ],
    };

    addBoard(newBoard);
    setSelectedBoard(newBoard);
    setGenerated(true);
  };

  return (
    <>
      <div
        className={`${className} group fixed top-0 left-0 z-20 flex h-full items-start justify-center bg-zinc-900 backdrop-blur-lg ${
          leftSidebarPref.main === 'open'
            ? 'opacity-100'
            : 'pointer-events-none opacity-0 md:pointer-events-auto md:opacity-100'
        } transition-all duration-300`}
      >
        <div className="flex h-full w-16 flex-col border-r border-zinc-800/80 pt-6 pb-2">
          <div className="relative mx-3 flex justify-start pl-[0.2rem] pb-1">
            <Logo
              alwaysShowLabel={leftSidebarPref.main === 'open'}
              showLabel={leftSidebarPref.main !== 'closed'}
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
                activeIcon={<TaskIconSolid className="w-8" />}
                inactiveIcon={<TaskIconOutline className="w-8" />}
                label="Tasks"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
              <SidebarTab
                href="/expenses"
                activeIcon={<MoneyIconSolid className="w-8" />}
                inactiveIcon={<MoneyIconOutline className="w-8" />}
                label="Expenses"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
            </div>

            <SidebarDivider />

            {isLoading || (
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
              href="/settings"
              className={`${
                leftSidebarPref.main !== 'closed'
                  ? '-translate-x-1 justify-start'
                  : 'justify-center self-center'
              } relative flex w-full items-center transition duration-300`}
            >
              <Tooltip
                label={
                  <div className="font-semibold">
                    <div>{data?.displayName || 'Unknown'}</div>
                    {data?.username && (
                      <div className="text-blue-300">@{data.username}</div>
                    )}
                  </div>
                }
                disabled={
                  !data?.displayName || leftSidebarPref.main !== 'closed'
                }
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
                      {getInitials(data?.displayName ?? 'Unknown')}
                    </Avatar>
                  </Indicator>

                  <div
                    className={
                      leftSidebarPref.main === 'closed'
                        ? 'md:hidden'
                        : leftSidebarPref.main === 'auto'
                        ? 'opacity-0 transition duration-300 group-hover:opacity-100'
                        : ''
                    }
                  >
                    <div className="text-md min-w-max font-bold">
                      {data?.displayName ||
                        user?.email ||
                        user?.phone ||
                        'Not logged in'}
                    </div>
                    {data?.username && (
                      <div className="min-w-max text-sm font-semibold text-blue-300">
                        @{data?.username}
                      </div>
                    )}
                  </div>
                </div>
              </Tooltip>
            </Link>
          </div>
        </div>

        {leftSidebarPref.secondary === 'visible' &&
          (boards.length === 0 ? (
            <div className="hidden h-full w-full flex-col items-center justify-center gap-4 border-r border-zinc-800/80 p-8 text-center md:flex">
              <div className="text-lg font-semibold">
                Start organizing your tasks in a miraculous way.
              </div>
              <button
                onClick={showEditBoardModal}
                className="rounded-lg bg-purple-300/20 px-4 py-2 text-lg font-semibold text-purple-300 transition hover:bg-purple-300/30"
              >
                Create a board
              </button>
            </div>
          ) : (
            <div className="relative hidden h-full w-full flex-col border-r border-zinc-800/80 pt-6 md:flex">
              <div className="relative mx-3 flex justify-between gap-1 text-2xl font-semibold">
                <Select
                  defaultValue={selectedBoard?.id}
                  data={boards.map((board) => ({
                    value: board.id,
                    label: board.name || 'Untitled',
                  }))}
                  onChange={(value) => {
                    setSelectedBoard(
                      boards?.find((board) => board.id === value) || null
                    );
                  }}
                  value={selectedBoard?.id}
                />
                <div className="flex gap-1">
                  <Tooltip
                    label={<div className="text-blue-300">New board</div>}
                    color="#182a3d"
                    withArrow
                  >
                    <button
                      className="rounded border border-transparent p-1 transition hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300"
                      onClick={showEditBoardModal}
                    >
                      <SquaresPlusIcon className="w-6" />
                    </button>
                  </Tooltip>
                  <Tooltip
                    label={<div className="text-blue-300">New task list</div>}
                    color="#182a3d"
                    withArrow
                  >
                    <button className="rounded border border-transparent p-1 transition hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300">
                      <FolderPlusIcon className="w-6" />
                    </button>
                  </Tooltip>
                  {selectedBoard && (
                    <Tooltip
                      label={<div className="text-blue-300">New task</div>}
                      color="#182a3d"
                      withArrow
                    >
                      <button
                        className="rounded border border-transparent p-1 transition hover:border-blue-300/30 hover:bg-blue-500/30 hover:text-blue-300"
                        onClick={() => showEditTaskModal(selectedBoard)}
                      >
                        <PlusCircleIcon className="w-6" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>

              <SidebarDivider padBottom={false} />

              {selectedBoard?.tasks?.length === 0 ? (
                <div className="flex h-full items-center justify-center overflow-auto p-8 text-center text-xl font-semibold text-zinc-400/80">
                  Create a task to get started
                </div>
              ) : (
                <div className="flex flex-col gap-3 overflow-auto p-4 scrollbar-none">
                  {selectedBoard?.tasks?.map((task) => (
                    <Checkbox
                      key={task.id}
                      label={task.name}
                      checked={task.completed}
                    />
                  ))}
                </div>
              )}

              {generated ||
                (selectedBoard?.tasks && selectedBoard.tasks.length >= 3 && (
                  <button
                    onClick={generateMeetingChecklist}
                    className="absolute bottom-0 w-full bg-purple-300/20 p-4 text-center text-xl font-semibold text-purple-300 transition hover:bg-purple-300/30"
                  >
                    Generate meeting checklist
                  </button>
                ))}
            </div>
          ))}
      </div>

      <div
        className={`z-10 h-screen w-screen bg-zinc-900/50 backdrop-blur md:hidden ${
          leftSidebarPref.main === 'open' ? 'block' : 'hidden'
        }`}
        onClick={() =>
          changeLeftSidebarPref({ main: 'closed', secondary: 'hidden' })
        }
      />
    </>
  );
}

export default LeftSidebar;
