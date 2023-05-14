import {
  HomeIcon,
  Cog6ToothIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  BuildingOffice2Icon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  BellIcon,
} from '@heroicons/react/24/outline';

import SidebarLink from './SidebarLink';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import { Avatar, Divider, Popover, Tooltip } from '@mantine/core';
import { useUser } from '../../hooks/useUser';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { getInitials } from '../../utils/name-helper';
import { useState } from 'react';
import SidebarButton from './SidebarButton';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSessionContext } from '@supabase/auth-helpers-react';
import WorkspaceSelector from '../selectors/WorkspaceSelector';
import useTranslation from 'next-translate/useTranslation';
import CreateNewButton from './sidebar/CreateNewButton';
import SidebarLinkList from './sidebar/SidebarLinkList';
import SidebarTeamList from './sidebar/SidebarTeamList';
import { ROOT_WORKSPACE_ID } from '../../constants/common';
import { closeSidebarOnMobile } from '../../utils/responsive-helper';
import { User } from '../../types/primitives/User';
import useSWR from 'swr';

function LeftSidebar({ className }: SidebarProps) {
  const router = useRouter();

  const { sidebar, setSidebar, toggleSidebar } = useAppearance();
  const { supabaseClient } = useSessionContext();
  const { user } = useUser();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/');
  };

  const { ws, workspaceInvites } = useWorkspaces();

  const apiPath = ws?.id
    ? `/api/workspaces/${ws.id}/members?page=1&itemsPerPage=4`
    : null;

  const { data, error } = useSWR<{ data: User[]; count: number }>(apiPath);

  const members = data?.data;
  const membersCount = data?.count || 0;
  const membersLoading = !members && !error;

  const [userPopover, setUserPopover] = useState(false);

  const { t } = useTranslation('sidebar-tabs');

  const invite = t('invite');
  const moreMembers = t('more-members');

  const home = t('home');
  const notifications = t('notifications');

  const collapseSidebar = t('collapse-sidebar');
  const expandSidebar = t('expand-sidebar');

  const settings = t('common:settings');
  const logout = t('common:logout');

  const isRootWs = ws?.id === ROOT_WORKSPACE_ID;

  return (
    <div
      className={`group absolute inset-0 z-[1000] flex h-full flex-col border-r border-zinc-800/80 bg-zinc-900 pb-2 pt-4 md:static ${
        sidebar === 'open'
          ? 'inset-0 w-full opacity-100 md:w-72'
          : 'pointer-events-none w-0 opacity-0 md:pointer-events-auto md:w-16 md:opacity-100'
      } ${className} transition-all duration-300`}
    >
      <div className="relative mx-4 flex items-center justify-between pb-1">
        <Logo
          alwaysShowLabel={sidebar === 'open'}
          showLabel={sidebar !== 'closed'}
          onClick={() => closeSidebarOnMobile({ window, setSidebar })}
        />

        <button
          className="rounded-lg bg-zinc-800 p-1.5 transition hover:bg-zinc-700 md:hidden"
          onClick={toggleSidebar}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <Divider className="my-2" />

      {ws?.id && (
        <>
          <div className="mx-2">
            <Tooltip
              label={
                <div>
                  <div className="font-semibold">
                    {ws.name || 'Unnamed Workspace'}
                  </div>
                  <div className="text-xs font-semibold">
                    {membersCount} {membersCount <= 1 ? 'member' : 'members'}
                  </div>
                </div>
              }
              position="right"
              offset={16}
              disabled={sidebar === 'open'}
            >
              <div
                className={`${
                  isRootWs
                    ? 'border-yellow-300/20 bg-yellow-300/10'
                    : 'border-zinc-700/50 bg-zinc-800/50'
                } rounded border p-2 transition`}
              >
                <div>
                  <div
                    className={`flex ${
                      sidebar === 'closed'
                        ? 'items-center justify-center'
                        : 'mb-1 justify-between gap-2 font-semibold'
                    }`}
                  >
                    <Link
                      href={`/${ws.id}`}
                      className={`${
                        isRootWs
                          ? 'text-yellow-200 hover:text-yellow-100'
                          : 'text-zinc-300 hover:text-zinc-100'
                      } line-clamp-1 transition`}
                      onClick={() =>
                        closeSidebarOnMobile({ window, setSidebar })
                      }
                    >
                      {sidebar === 'closed' ? (
                        <BuildingOffice2Icon className="w-5" />
                      ) : (
                        ws?.name || 'Unnamed Workspace'
                      )}
                    </Link>
                  </div>
                </div>

                {sidebar === 'closed' || (
                  <div className="flex items-center justify-between">
                    <Tooltip.Group>
                      <Avatar.Group spacing="sm" color="blue">
                        {membersLoading
                          ? Array.from({ length: 4 }, (_, i) => (
                              <Avatar
                                key={i}
                                color={isRootWs ? 'yellow' : 'blue'}
                                radius="xl"
                                className="animate-pulse"
                                classNames={{
                                  root: isRootWs ? 'border-yellow-900/20' : '',
                                }}
                              >
                                ...
                              </Avatar>
                            ))
                          : members &&
                            members
                              .slice(0, membersCount > 4 ? 3 : 4)
                              .map((member) => (
                                <Tooltip
                                  key={member.id}
                                  label={
                                    <div className="font-semibold">
                                      <div>
                                        {member?.display_name || member?.email}
                                      </div>
                                      {member?.handle && (
                                        <div
                                          className={
                                            isRootWs
                                              ? 'text-yellow-200'
                                              : 'text-blue-300'
                                          }
                                        >
                                          @{member.handle}
                                        </div>
                                      )}
                                    </div>
                                  }
                                  color={isRootWs ? '#2d291c' : '#182a3d'}
                                >
                                  <Avatar
                                    color={isRootWs ? 'yellow' : 'blue'}
                                    radius="xl"
                                    classNames={{
                                      root: isRootWs
                                        ? 'border-yellow-900/20'
                                        : '',
                                    }}
                                  >
                                    {getInitials(
                                      member?.display_name || member?.email
                                    )}
                                  </Avatar>
                                </Tooltip>
                              ))}
                        {membersCount > 4 && (
                          <Tooltip
                            label={
                              <div className="font-semibold">
                                {membersCount - 3} {moreMembers}
                              </div>
                            }
                            color={isRootWs ? '#2d291c' : '#182a3d'}
                          >
                            <Avatar
                              color={isRootWs ? 'yellow' : 'blue'}
                              radius="xl"
                              classNames={{
                                root: isRootWs ? 'border-yellow-900/20' : '',
                              }}
                            >
                              +{membersCount - 3}
                            </Avatar>
                          </Tooltip>
                        )}
                      </Avatar.Group>
                    </Tooltip.Group>

                    <Link
                      href={`/${ws.id}/members`}
                      className={`${
                        isRootWs
                          ? 'bg-yellow-300/10 text-yellow-200'
                          : 'bg-purple-300/10 text-purple-300'
                      } ${
                        router.pathname === `/[wsId]/members`
                          ? 'pointer-events-none cursor-default select-none opacity-0'
                          : isRootWs
                          ? 'hover:bg-yellow-300/20'
                          : 'hover:bg-purple-300/20'
                      } flex items-center gap-1 rounded-full px-4 py-0.5 font-semibold transition`}
                      onClick={() =>
                        closeSidebarOnMobile({ window, setSidebar })
                      }
                    >
                      <div>{invite}</div>
                      <UserPlusIcon className="w-4" />
                    </Link>
                  </div>
                )}
              </div>
            </Tooltip>

            <Divider variant="dashed" className="my-2" />
          </div>

          <CreateNewButton />
          <Divider className="mt-2" />

          <div className="scrollbar-none my-2 h-full overflow-auto">
            {ws?.preset && (
              <SidebarLinkList
                wsId={ws.id}
                wsPreset={ws.preset}
                sidebarOpened={sidebar === 'open'}
              />
            )}

            <SidebarTeamList wsId={ws.id} sidebarOpened={sidebar === 'open'} />
          </div>
        </>
      )}

      {ws?.id ? (
        <div className={`mx-2 ${ws || 'h-full'}`}>
          <SidebarLink
            href={`/${ws.id}/notifications`}
            onClick={() => setUserPopover(false)}
            activeIcon={<BellIcon className="w-5" />}
            label={notifications}
            showTooltip={sidebar === 'closed'}
            trailingIcon={
              <div
                className={`flex aspect-square h-6 items-center justify-center rounded-lg bg-red-300/20 text-sm text-red-300 ${
                  (workspaceInvites?.length || 0) === 0 ? 'opacity-0' : ''
                }`}
              >
                {(workspaceInvites?.length || 0) > 9
                  ? '9+'
                  : workspaceInvites?.length || 0}
              </div>
            }
            classNames={{
              root: 'hidden md:block',
            }}
          />
        </div>
      ) : (
        <div className={`mx-2 h-full`}>
          <SidebarLink
            href={`/onboarding?nextUrl=&withWorkspace=true`}
            onClick={() => setUserPopover(false)}
            activeIcon={<HomeIcon className="w-5" />}
            label={home}
            showTooltip={sidebar === 'closed'}
          />
        </div>
      )}

      <Divider className="my-2 hidden md:block" />

      <div className="mx-2 hidden md:block">
        <SidebarButton
          onClick={toggleSidebar}
          label={sidebar === 'closed' ? expandSidebar : collapseSidebar}
          activeIcon={
            sidebar === 'closed' ? (
              <ChevronRightIcon className="w-5" />
            ) : (
              <ChevronLeftIcon className="w-5" />
            )
          }
          showLabel={sidebar === 'open'}
          showTooltip={sidebar === 'closed'}
          classNames={{
            root: 'w-full',
          }}
        />
      </div>

      {ws?.id && (
        <>
          <Divider className="my-2" variant="dashed" />
          <div className="mx-2 flex items-center justify-center gap-2">
            {sidebar === 'open' && (
              <WorkspaceSelector
                className="w-full md:w-auto"
                onChange={() => closeSidebarOnMobile({ window, setSidebar })}
              />
            )}

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
                      <div>{user?.display_name || user?.email}</div>
                      {user?.handle && (
                        <div className="text-blue-300">@{user.handle}</div>
                      )}
                    </div>
                  }
                  disabled={userPopover}
                  offset={sidebar === 'closed' ? 20 : 16}
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
                    {getInitials(user?.display_name || user?.email)}
                  </Avatar>
                </Tooltip>
              </Popover.Target>

              <Popover.Dropdown className="grid gap-1 p-1">
                {sidebar !== 'open' && (
                  <>
                    <WorkspaceSelector
                      showLabel
                      className="mx-2 mb-2"
                      onChange={() => {
                        setUserPopover(false);
                        closeSidebarOnMobile({ window, setSidebar });
                      }}
                    />
                    <Divider variant="dashed" />
                  </>
                )}

                <SidebarLink
                  href="/settings"
                  onClick={() => setUserPopover(false)}
                  activeIcon={<Cog6ToothIcon className="w-5" />}
                  label={settings}
                  defaultActive={false}
                  left
                />

                <Divider variant="dashed" />
                <SidebarButton
                  onClick={() => {
                    setUserPopover(false);
                    closeSidebarOnMobile({ window, setSidebar });
                    handleLogout();
                  }}
                  activeIcon={<ArrowRightOnRectangleIcon className="w-5" />}
                  label={logout}
                  left
                />
              </Popover.Dropdown>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}

export default LeftSidebar;
