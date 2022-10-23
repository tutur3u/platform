import { Cog6ToothIcon } from '@heroicons/react/24/solid';

import SidebarTab from './SidebarTab';
import { useRouter } from 'next/router';
import styles from './layout.module.css';
import { Avatar } from '@mantine/core';
import { useUser } from '../../hooks/useUser';

interface SidebarProps {
  className?: string;
}
function RightSidebar({ className }: SidebarProps) {
  const router = useRouter();
  const { user } = useUser();

  return (
    <div
      className={`${className} group z-20 h-full fixed flex-col justify-center items-center top-0 right-0 border-r border-zinc-800/80 bg-zinc-900/50 backdrop-blur-lg`}
    >
      <div className="w-full h-full flex flex-col">
        <div className="pb-4 mx-3 mt-4 relative flex justify-start items-center gap-2 overflow-hidden border-b border-zinc-700">
          <button className="pt-1 pl-[0.15rem]">
            <Avatar size={35} color="cyan" radius="xl" />
          </button>
          <div className="text-md pt-1 font-semibold">
            <span>{user ? user?.email || user?.phone : 'Not logged in'}</span>
          </div>
        </div>
        <div className={`${styles.scrollbar} overflow-scroll h-full`}>
          <div className="mt-4 p-2 flex flex-col items-start gap-6">
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
