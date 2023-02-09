import {
  HomeIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  PlusIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  BuildingOffice2Icon,
  Squares2X2Icon,
  UserPlusIcon,
  SquaresPlusIcon,
} from '@heroicons/react/24/solid';

import SidebarLink from './SidebarLink';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import { Avatar, Divider, Popover, Tooltip } from '@mantine/core';
import { useUserData } from '../../hooks/useUserData';
import { useOrgs } from '../../hooks/useOrganizations';
import OrgEditForm from '../forms/OrgEditForm';
import { openModal } from '@mantine/modals';
import { getInitials } from '../../utils/name-helper';
import { useEffect, useState } from 'react';
import SidebarButton from './SidebarButton';
import OrganizationSelector from '../selectors/OrganizationSelector';
import { useProjects } from '../../hooks/useProjects';
import ProjectEditForm from '../forms/ProjectEditForm';
import Link from 'next/link';

function LeftSidebar({ className }: SidebarProps) {
  const { leftSidebarPref, changeLeftSidebarMainPref } = useAppearance();
  const { data: user } = useUserData();

  const { createOrg } = useOrgs();
  const { orgId, org, members, isProjectsLoading, createProject, projects } =
    useProjects();

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

              <Divider className="my-1" />

              {orgId && (
                <SidebarButton
                  onClick={() => {
                    setNewPopover(false);
                    showProjectEditForm();
                  }}
                  activeIcon={<Squares2X2Icon className="w-5" />}
                  label="New project"
                  left
                />
              )}
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

              {orgId && (
                <>
                  <Divider className="my-1" />
                  <SidebarButton
                    onClick={() => setNewPopover(false)}
                    activeIcon={<UserPlusIcon className="w-5" />}
                    label="Invite people"
                    left
                    disabled
                  />
                </>
              )}
            </Popover.Dropdown>
          </Popover>

          <Divider className="mt-2" />

          <div className="scrollbar-none my-2 h-full overflow-auto">
            <div className="mx-2 mb-2 flex flex-col gap-1">
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
                href="/finance"
                onClick={() => setUserPopover(false)}
                activeIcon={<BanknotesIcon className="w-5" />}
                label="Finance"
                showTooltip={leftSidebarPref.main === 'closed'}
              />
            </div>

            <Divider />

            <div className="m-2">
              {org.id && (
                <>
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
                    <div className="rounded border border-zinc-700/50 bg-zinc-800 p-2 transition">
                      <div className="">
                        <div
                          className={`mb-1 flex ${
                            leftSidebarPref.main === 'closed'
                              ? 'items-center justify-center'
                              : 'justify-between gap-2 font-semibold'
                          }`}
                        >
                          <Link
                            href={`/orgs/${orgId}`}
                            className="line-clamp-1 text-zinc-400 transition hover:text-zinc-100"
                          >
                            {leftSidebarPref.main === 'closed' ? (
                              <BuildingOffice2Icon className="w-5" />
                            ) : (
                              org?.name || 'Unnamed Organization'
                            )}
                          </Link>

                          {leftSidebarPref.main === 'closed' || (
                            <div className="flex cursor-default items-center rounded bg-blue-500/20 px-2 py-0.5 text-sm font-bold text-blue-300">
                              Free
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between">
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
                            {members.length > 3 && (
                              <Tooltip
                                label={
                                  <div className="font-semibold">
                                    {members.length - 3} more
                                  </div>
                                }
                                color="#182a3d"
                              >
                                <Avatar color="blue" radius="xl">
                                  +{members.length - 3}
                                </Avatar>
                              </Tooltip>
                            )}
                          </Avatar.Group>
                        </Tooltip.Group>

                        {leftSidebarPref.main === 'closed' || (
                          <Link
                            href={`/orgs/${orgId}/members`}
                            className="flex items-center gap-1 rounded-full bg-purple-300/10 px-4 py-0.5 font-semibold text-purple-300 transition hover:bg-purple-300/20"
                          >
                            <div>Invite</div>
                            <UserPlusIcon className="w-4" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </Tooltip>

                  <Divider variant="dashed" className="my-2" />
                </>
              )}

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
                      <div>{user?.display_name || user?.email}</div>
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
                    {getInitials(user?.display_name || user?.email)}
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
