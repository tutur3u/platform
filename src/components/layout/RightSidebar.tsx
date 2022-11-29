import { Cog6ToothIcon } from '@heroicons/react/24/solid';

import SidebarTab from './SidebarTab';
import { useRouter } from 'next/router';
import { Avatar } from '@mantine/core';
import { SidebarProps } from '../../types/SidebarProps';
import { useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';
import { useAppearance } from '../../hooks/useAppearance';

function RightSidebar({ className }: SidebarProps) {
  const router = useRouter();
  const { rightSidebar } = useAppearance();

  const user = useUser();
  const { data } = useUserData();

  return (
    <div
      className={`${className} group fixed top-0 right-0 z-20 hidden h-full flex-col items-center justify-center border-l border-zinc-800/80 bg-zinc-900 backdrop-blur-lg md:block`}
    >
      <div className="flex h-full w-full flex-col">
        <div className="relative m-3 mt-4 flex items-center justify-start gap-2 overflow-hidden rounded transition duration-300">
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
        <div className="mx-3 mb-4 border-t border-zinc-700 transition-all duration-300" />
        <div className="h-full overflow-auto">
          <div className="flex flex-col items-start gap-6 p-2">
            <SidebarTab
              href="/settings"
              currentPath={router.pathname}
              icon={<Cog6ToothIcon />}
              label="Settings"
              showTooltip={rightSidebar === 'closed'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default RightSidebar;
