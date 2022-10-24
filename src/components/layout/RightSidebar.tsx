import { Cog6ToothIcon } from '@heroicons/react/24/solid';

import SidebarTab from './SidebarTab';
import { useRouter } from 'next/router';
import { Avatar } from '@mantine/core';
import { SidebarProps } from '../../types/SidebarProps';
import { useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';

function RightSidebar({ className }: SidebarProps) {
  const router = useRouter();

  const user = useUser();
  const { data } = useUserData();

  return (
    <div
      className={`${className} hidden md:block group z-20 h-full fixed flex-col justify-center items-center top-0 right-0 border-l border-zinc-800/80 bg-zinc-900/50 backdrop-blur-lg`}
    >
      <div className="w-full h-full flex flex-col">
        <div className="m-3 mt-4 relative flex justify-start items-center gap-2 overflow-hidden rounded transition duration-300">
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
        <div className="mx-3 mb-4 border-t border-zinc-700 transition-all duration-300" />
        <div className="overflow-auto h-full">
          <div className="p-2 flex flex-col items-start gap-6">
            <SidebarTab
              href="/settings"
              currentPath={router.pathname}
              icon={<Cog6ToothIcon />}
              label="Settings"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default RightSidebar;
