import {
  BanknotesIcon as MoneyIconSolid,
  CalendarDaysIcon as CalendarIconSolid,
  ClipboardDocumentListIcon as TaskIconSolid,
  Cog6ToothIcon as SettingsIconSolid,
  HomeIcon as HomeIconSolid,
} from '@heroicons/react/24/solid';

import {
  BanknotesIcon as MoneyIconOutline,
  CalendarDaysIcon as CalendarIconOutline,
  ClipboardDocumentListIcon as TaskIconOutline,
  Cog6ToothIcon as SettingsIconOutline,
  HomeIcon as HomeIconOutline,
} from '@heroicons/react/24/outline';

import SidebarTab from './SidebarTab';
import { useRouter } from 'next/router';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import { Avatar, Indicator } from '@mantine/core';
import { useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';
import SidebarDivider from './SidebarDivider';

function LeftSidebar({ className }: SidebarProps) {
  const router = useRouter();
  const { leftSidebar, changeLeftSidebar } = useAppearance();
  const user = useUser();
  const { data } = useUserData();

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
            <div className="flex flex-col items-start gap-6 p-2">
              <SidebarTab
                href="/"
                currentPath={router.pathname}
                activeIcon={<HomeIconSolid />}
                inactiveIcon={<HomeIconOutline />}
                label="Home"
                showTooltip={leftSidebar === 'closed'}
              />
              <SidebarTab
                href="/calendar"
                currentPath={router.pathname}
                activeIcon={<CalendarIconSolid />}
                inactiveIcon={<CalendarIconOutline />}
                label="Calendar"
                showTooltip={leftSidebar === 'closed'}
              />
              <SidebarTab
                href="/tasks"
                currentPath={router.pathname}
                activeIcon={<TaskIconSolid />}
                inactiveIcon={<TaskIconOutline />}
                label="Tasks"
                showTooltip={leftSidebar === 'closed'}
              />
              <SidebarTab
                href="/expenses"
                currentPath={router.pathname}
                activeIcon={<MoneyIconSolid />}
                inactiveIcon={<MoneyIconOutline />}
                label="Expenses"
                showTooltip={leftSidebar === 'closed'}
              />
            </div>

            <SidebarDivider />
          </div>

          <div className="flex flex-col items-start gap-6 p-2">
            <SidebarTab
              href="/settings"
              currentPath={router.pathname}
              activeIcon={<SettingsIconSolid />}
              inactiveIcon={<SettingsIconOutline />}
              label="Settings"
              showTooltip={leftSidebar === 'closed'}
            />

            <div
              className={`${
                leftSidebar === 'open' ? 'justify-start' : 'justify-center'
              } relative flex items-center gap-2 rounded transition duration-300`}
            >
              <Indicator
                color="green"
                position="bottom-end"
                size={12}
                offset={5}
                withBorder
              >
                <Avatar color="blue" radius="xl" src="/media/logos/dark.png" />
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
          </div>
        </div>
      </div>
      <div
        className={`z-10 h-screen w-screen bg-zinc-900/50 backdrop-blur md:hidden ${
          leftSidebar === 'open' ? 'block' : 'hidden'
        }`}
        onClick={() => changeLeftSidebar('closed')}
      ></div>
    </>
  );
}

export default LeftSidebar;
