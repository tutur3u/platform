import { Avatar, Divider, Loader, Popover } from '@mantine/core';
import { getInitials } from '../../utils/name-helper';
import {
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  HomeIcon,
} from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useState } from 'react';
import SidebarLink from './SidebarLink';
import SidebarButton from './SidebarButton';
import { useUser } from '../../hooks/useUser';
import useTranslation from 'next-translate/useTranslation';

const UserProfilePopover = () => {
  const { user, isLoading } = useUser();
  const router = useRouter();

  const { supabaseClient } = useSessionContext();

  const [userPopover, setUserPopover] = useState(false);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/');
  };

  const { t } = useTranslation('common');

  const home = t('home');
  const settings = t('settings');
  const logout = t('logout');

  return (
    <Popover
      opened={userPopover}
      onChange={setUserPopover}
      width={200}
      offset={8}
      position="top-end"
    >
      <Popover.Target>
        {isLoading ? (
          <Loader />
        ) : (
          <Avatar
            color="blue"
            className={`cursor-pointer hover:bg-blue-500/10 ${
              userPopover ? 'bg-blue-500/10' : ''
            }`}
            onClick={() => setUserPopover((o) => !o)}
          >
            {getInitials(user?.display_name || user?.email)}
          </Avatar>
        )}
      </Popover.Target>

      <Popover.Dropdown className="grid gap-1 p-1">
        <SidebarLink
          href="/home"
          onClick={() => setUserPopover(false)}
          activeIcon={<HomeIcon className="w-5" />}
          label={home}
          defaultActive={false}
          left
        />

        <Divider variant="dashed" />

        <SidebarLink
          href="/settings"
          onClick={() => setUserPopover(false)}
          activeIcon={<Cog6ToothIcon className="w-5" />}
          label={settings}
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
          label={logout}
          left
        />
      </Popover.Dropdown>
    </Popover>
  );
};

export default UserProfilePopover;
