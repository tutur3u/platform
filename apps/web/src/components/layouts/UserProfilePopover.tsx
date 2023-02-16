import { Avatar, Divider, Popover } from '@mantine/core';
import { getInitials } from '../../utils/name-helper';
import {
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  HomeIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useState } from 'react';
import { UserData } from '../../types/primitives/UserData';
import SidebarLink from './SidebarLink';
import SidebarButton from './SidebarButton';

interface Props {
  user: UserData;
}

const UserProfilePopover = ({ user }: Props) => {
  const router = useRouter();

  const { supabaseClient } = useSessionContext();

  const [userPopover, setUserPopover] = useState(false);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/');
  };

  return (
    <Popover
      opened={userPopover}
      onChange={setUserPopover}
      width={200}
      offset={8}
      position="top-end"
    >
      <Popover.Target>
        <Avatar
          color="blue"
          className={`cursor-pointer hover:bg-blue-500/10 ${
            userPopover ? 'bg-blue-500/10' : ''
          }`}
          onClick={() => setUserPopover((o) => !o)}
        >
          {getInitials(user?.display_name || user?.email)}
        </Avatar>
      </Popover.Target>

      <Popover.Dropdown className="grid gap-1 p-1">
        <SidebarLink
          href="/home"
          onClick={() => setUserPopover(false)}
          activeIcon={<HomeIcon className="w-5" />}
          label="Home"
          defaultActive={false}
          left
        />

        <Divider variant="dashed" />

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

        <Divider variant="dashed" />

        <SidebarButton
          onClick={() => {
            setUserPopover(false);
            handleLogout();
          }}
          activeIcon={<ArrowRightOnRectangleIcon className="w-5" />}
          label="Log out"
          left
        />
      </Popover.Dropdown>
    </Popover>
  );
};

export default UserProfilePopover;
