import { Avatar, Divider, Loader, Popover } from '@mantine/core';
import { getInitials } from '../../utils/name-helper';
import {
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  HomeIcon,
} from '@heroicons/react/24/solid';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useState } from 'react';
import SidebarLink from './SidebarLink';
import SidebarButton from './SidebarButton';
import { useUser } from '../../hooks/useUser';
import useTranslation from 'next-translate/useTranslation';
import { logout } from '../../utils/auth-handler';
import { useRouter } from 'next/router';

const UserProfilePopover = () => {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const { user, isLoading } = useUser();
  const { t } = useTranslation('common');

  const [userPopover, setUserPopover] = useState(false);

  const home = t('home');
  const settings = t('settings');
  const logoutLabel = t('logout');

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
            src={user?.avatar_url}
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
          href="/onboarding"
          onClick={() => setUserPopover(false)}
          activeIcon={<HomeIcon className="w-5" />}
          label={home}
          defaultActive={false}
          left
        />

        <SidebarLink
          href="/settings"
          onClick={() => setUserPopover(false)}
          activeIcon={<Cog6ToothIcon className="w-5" />}
          label={settings}
          defaultActive={false}
          left
        />

        <Divider />

        <SidebarButton
          onClick={() => {
            setUserPopover(false);
            logout({ supabase, router });
          }}
          activeIcon={<ArrowRightOnRectangleIcon className="w-5" />}
          label={logoutLabel}
          left
        />
      </Popover.Dropdown>
    </Popover>
  );
};

export default UserProfilePopover;
