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
} from '@heroicons/react/24/outline';

import SidebarTab from './SidebarTab';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import { Avatar, Indicator, Tooltip } from '@mantine/core';
import { useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';
import SidebarDivider from './SidebarDivider';
import { useOrgs } from '../../hooks/useOrganizations';
import OrgEditForm from '../forms/OrgEditForm';
import { openModal } from '@mantine/modals';
import { Organization } from '../../types/primitives/Organization';
import Link from 'next/link';

function LeftSidebar({ className }: SidebarProps) {
  const { leftSidebar, changeLeftSidebar } = useAppearance();
  const user = useUser();
  const { data } = useUserData();

  const { isLoading, orgs, createOrg } = useOrgs();

  const getInitials = (name: string) => {
    const names = name.toUpperCase().split(' ');
    if (names.length === 1) return names[0].charAt(0);
    return names[0].charAt(0) + names[names.length - 1].charAt(0);
  };

  const addOrg = (org: Organization) => createOrg(org);

  const showEditOrgModal = () => {
    openModal({
      title: 'New organization',
      centered: true,
      children: <OrgEditForm onSubmit={addOrg} />,
    });
  };

  return (
    <>
      <div
        className={`${className} group fixed top-0 left-0 z-20 block h-full flex-col items-center justify-center border-r border-zinc-800/80 bg-zinc-900 backdrop-blur-lg ${
          leftSidebar === 'open'
            ? 'opacity-100'
            : 'pointer-events-none opacity-0 md:pointer-events-auto md:opacity-100'
        } transition-all duration-300`}
      >
        <div className="flex h-full w-full flex-col pt-6 pb-2">
          <div
            className={`relative flex pl-[0.21rem] pb-1 ${
              leftSidebar === 'open' || leftSidebar === 'auto'
                ? 'mx-3 justify-start'
                : 'justify-center'
            }`}
          >
            <Logo
              alwaysShowLabel={leftSidebar === 'open'}
              showLabel={leftSidebar !== 'closed'}
            />
          </div>

          <SidebarDivider />

          <div className="h-full overflow-auto">
            <div className="flex flex-col items-start gap-6 p-4">
              <SidebarTab
                href="/"
                activeIcon={<HomeIconSolid className="w-8" />}
                inactiveIcon={<HomeIconOutline className="w-8" />}
                label="Home"
                showTooltip={leftSidebar === 'closed'}
              />
              <SidebarTab
                href="/calendar"
                activeIcon={<CalendarIconSolid className="w-8" />}
                inactiveIcon={<CalendarIconOutline className="w-8" />}
                label="Calendar"
                showTooltip={leftSidebar === 'closed'}
              />
              <SidebarTab
                href="/tasks"
                activeIcon={<TaskIconSolid className="w-8" />}
                inactiveIcon={<TaskIconOutline className="w-8" />}
                label="Tasks"
                showTooltip={leftSidebar === 'closed'}
              />
              <SidebarTab
                href="/expenses"
                activeIcon={<MoneyIconSolid className="w-8" />}
                inactiveIcon={<MoneyIconOutline className="w-8" />}
                label="Expenses"
                showTooltip={leftSidebar === 'closed'}
              />
            </div>

            <SidebarDivider />

            {isLoading || (
              <div className="flex flex-col items-start gap-3 p-4">
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
                    showTooltip={leftSidebar === 'closed'}
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
                  showTooltip={leftSidebar === 'closed'}
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
              showTooltip={leftSidebar === 'closed'}
            />

            <Link
              href="/settings"
              className={`${
                leftSidebar !== 'closed'
                  ? 'justify-start'
                  : 'justify-center self-center'
              } relative flex w-full items-center gap-2 rounded transition duration-300`}
            >
              <Tooltip
                label={
                  <div className="font-semibold text-blue-300">
                    {data?.displayName}
                  </div>
                }
                disabled={!data?.displayName}
                position="right"
                color="#182a3d"
                offset={20}
                withArrow
              >
                <div>
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

                  <div className={leftSidebar !== 'open' ? 'md:hidden' : ''}>
                    <div className="text-md min-w-max font-bold">
                      {data?.displayName ||
                        user?.email ||
                        user?.phone ||
                        'Not logged in'}
                    </div>
                    {data?.username && (
                      <div className="min-w-max text-sm font-semibold text-purple-300">
                        @{data?.username}
                      </div>
                    )}
                  </div>
                </div>
              </Tooltip>
            </Link>
          </div>
        </div>
      </div>

      <div
        className={`z-10 h-screen w-screen bg-zinc-900/50 backdrop-blur md:hidden ${
          leftSidebar === 'open' ? 'block' : 'hidden'
        }`}
        onClick={() => changeLeftSidebar('closed')}
      />
    </>
  );
}

export default LeftSidebar;
