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
        className={`${className} group z-20 block h-full fixed flex-col justify-center items-center top-0 left-0 border-r border-zinc-800/80 bg-zinc-900 backdrop-blur-lg ${
          leftSidebar === 'open'
            ? 'opacity-100'
            : 'opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto'
        } transition-all duration-300`}
      >
        <div className="w-full h-full flex flex-col">
          <div className="pl-[0.21rem] pb-4 mx-3 mt-4 relative flex justify-start overflow-hidden border-b border-zinc-700">
            <Logo alwaysShowLabel={leftSidebar === 'open'} />
          </div>
          <div className="overflow-auto h-full">
            <div className="mt-4 p-2 flex flex-col items-start gap-6">
              <SidebarTab
                href="/"
                currentPath={router.pathname}
                icon={<HomeIcon />}
                label="Home"
                showTooltip={leftSidebar === 'closed'}
              />
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
          <div className="m-3 mt-4 relative flex md:hidden justify-start items-center gap-2 overflow-hidden rounded transition duration-300">
            <div className="pl-[0.07rem]">
              <Avatar size={36} color="blue" radius="xl" />
            </div>
            <div>
              <div className="text-md font-bold min-w-max">
                {data?.displayName ||
                  user?.email ||
                  user?.phone ||
                  'Not logged in'}
              </div>
              {data?.username && (
                <div className="text-sm font-semibold min-w-max text-purple-300">
                  @{data?.username}
                </div>
              )}
            </div>
          </div>
          <div className="opacity-0 whitespace-nowrap group-hover:opacity-100 transition group-hover:duration-500 group-hover:delay-200 p-2 text-center text-zinc-500 font-semibold text-sm cursor-default">
            Version {APP_VERSION}
          </div>
        </div>
      </div>
      <div
        className={`w-screen md:hidden h-screen z-10 bg-zinc-900/50 backdrop-blur ${
          leftSidebar === 'open' ? 'block' : 'hidden'
        }`}
        onClick={() => changeLeftSidebar('closed')}
      ></div>
    </>
  );
}

export default LeftSidebar;
