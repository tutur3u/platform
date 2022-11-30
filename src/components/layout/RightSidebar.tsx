import { Avatar } from '@mantine/core';
import { SidebarProps } from '../../types/SidebarProps';
import { useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';

function RightSidebar({ className }: SidebarProps) {
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
      </div>
    </div>
  );
}

export default RightSidebar;
