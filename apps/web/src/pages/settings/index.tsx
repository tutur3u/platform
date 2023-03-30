import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { TextInput } from '@mantine/core';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useUser } from '../../hooks/useUser';
import { useRouter } from 'next/router';
import { useSegments } from '../../hooks/useSegments';
import moment from 'moment';
import {
  CakeIcon,
  EnvelopeIcon,
  IdentificationIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import HeaderX from '../../components/metadata/HeaderX';
import { DatePickerInput } from '@mantine/dates';
import SidebarLayout from '../../components/layouts/SidebarLayout';

const SettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment({
      content: 'Settings',
      href: '/settings',
    });
  }, [setRootSegment]);

  const router = useRouter();

  const { supabaseClient } = useSessionContext();
  const { user, updateUser } = useUser();

  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [handle, setUsername] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user?.display_name || '');
      setUsername(user?.handle || '');
      setBirthday(user?.birthday ? moment(user?.birthday).toDate() : null);
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);

    await updateUser?.({
      display_name: displayName,
      handle,
      birthday: birthday ? moment(birthday).format('YYYY-MM-DD') : null,
    });

    setSaving(false);
  };

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="grid gap-8 p-4 md:p-8 lg:grid-cols-2">
      <HeaderX label="Settings" />
      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-3xl font-bold">Account</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Manage your personal account
        </div>

        <div className="grid max-w-md gap-2">
          <TextInput
            label="Display name"
            placeholder="John Doe"
            value={displayName}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDisplayName(event.currentTarget.value)
            }
            icon={<UserCircleIcon className="h-5 w-5" />}
          />

          <TextInput
            label="Username"
            placeholder="tuturuuu"
            // replace all characters that are not a-z, 0-9, or _
            value={handle.replace(/[^a-z0-9_]/gi, '').toLowerCase()}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const handle = event.currentTarget.value.replace(
                /[^a-z0-9_]/gi,
                ''
              );

              // Limit to 20 characters
              if (handle.length > 20) return;
              setUsername(handle.toLowerCase());
            }}
            icon={<IdentificationIcon className="h-5 w-5" />}
          />

          <DatePickerInput
            placeholder="Your birthday"
            label="Birthday"
            icon={<CakeIcon className="h-5 w-5" />}
            value={birthday}
            onChange={setBirthday}
          />

          <TextInput
            label="Email"
            placeholder="example@tuturuuu.com"
            value={user?.email || ''}
            icon={<EnvelopeIcon className="h-5 w-5" />}
            readOnly
            disabled
          />
        </div>

        {user?.created_at && (
          <div className="mt-8 border-t border-zinc-700/70 pt-4 text-zinc-500">
            You are a member of Tuturuuu since{' '}
            <span className="font-semibold text-zinc-300">
              {moment(user.created_at).toDate().toLocaleDateString()}
            </span>{' '}
            <span className="font-semibold text-zinc-400">
              ({moment(user.created_at).fromNow()})
            </span>
            .
          </div>
        )}

        <div className="h-full" />

        <div
          onClick={handleSave}
          className="col-span-full mt-8 flex w-full cursor-pointer items-center justify-center rounded-lg border border-blue-300/20 bg-blue-300/10 p-2 text-xl font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
        >
          {saving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-3xl font-bold">Appearance</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Customize the look and feel of Tuturuuu
        </div>

        <div className="mb-2 text-xl font-semibold text-zinc-400">General</div>
        <div className="grid gap-4 text-center xl:grid-cols-2">
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Light mode</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-blue-300/30 bg-blue-300/20 p-2 text-xl font-semibold text-blue-300">
            Dark mode
          </div>
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-3xl font-bold">Security</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Manage your account security
        </div>

        <div className="grid h-full gap-4 text-center xl:grid-cols-2">
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Change password</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Change email</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="col-span-full flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Delete account</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div
            className="col-span-full flex w-full cursor-pointer items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 p-2 text-xl font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
            onClick={handleLogout}
          >
            Log out
          </div>
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-3xl font-bold">Notifications</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Manage your notification preferences
        </div>
        <div className="grid h-full gap-4 text-center xl:grid-cols-2">
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Web notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Push notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="col-span-full flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Email notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
        </div>
      </div>
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default SettingPage;
