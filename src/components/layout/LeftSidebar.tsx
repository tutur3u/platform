import { Cog6ToothIcon, HomeIcon } from '@heroicons/react/24/solid';

import SidebarTab from './SidebarTab';
import { APP_VERSION } from '../../constants/common';
import { useRouter } from 'next/router';
import Logo from '../common/Logo';
import { SidebarProps } from '../../types/SidebarProps';
import { useAppearance } from '../../hooks/useAppearance';
import { Avatar } from '@mantine/core';
import { useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';

function LeftSidebar({ className }: SidebarProps) {
  const router = useRouter();
  const { leftSidebar, changeLeftSidebar, rightSidebar } = useAppearance();
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
        <div className="flex h-full w-full flex-col">
          <div className="relative mx-3 mt-4 flex justify-start overflow-hidden border-b border-zinc-700 pl-[0.21rem] pb-4">
            <Logo alwaysShowLabel={leftSidebar === 'open'} />
          </div>
          <div className="h-full overflow-auto">
            <div className="mt-4 flex flex-col items-start gap-6 p-2">
              <SidebarTab
                href="/"
                currentPath={router.pathname}
                icon={<HomeIcon />}
                label="Home"
                showTooltip={leftSidebar === 'closed'}
              />
              {/* <SidebarTab
                href="/tasks"
                currentPath={router.pathname}
                icon={<ClipboardDocumentListIcon />}
                label="Tasks"
              /> */}
              <>
                <SidebarTab
                  href="/settings"
                  currentPath={router.pathname}
                  icon={<Cog6ToothIcon />}
                  label="Settings"
                  showTooltip={rightSidebar === 'closed'}
                  className="md:hidden"
                />
              </>
            </div>
          </div>
          <div className="relative m-3 mt-4 flex items-center justify-start gap-2 overflow-hidden rounded transition duration-300 md:hidden">
            <div className="pl-[0.07rem]">
              <Avatar size={36} color="blue" radius="xl" />
            </div>
            <div>
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
          <div className="cursor-default whitespace-nowrap p-2 text-center text-sm font-semibold text-zinc-500 opacity-0 transition group-hover:opacity-100 group-hover:delay-200 group-hover:duration-500">
            Version {APP_VERSION}
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
