import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';
import { TextInput } from '@mantine/core';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';
import { useSessionContext, useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';
import { useRouter } from 'next/router';
import { useAppearance } from '../../hooks/useAppearance';
import moment from 'moment';
import {
  CakeIcon,
  EnvelopeIcon,
  IdentificationIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import HeaderX from '../../components/metadata/HeaderX';
import { DatePicker } from '@mantine/dates';

export const getServerSideProps = withPageAuth({
  redirectTo: '/login?nextUrl=/settings',
});

const SettingPage: PageWithLayoutProps = () => {
  const {
    setRootSegment,
    changeRightSidebarPref,
    changeLeftSidebarSecondaryPref,
  } = useAppearance();

  useEffect(() => {
    setRootSegment({
      content: 'Settings',
      href: '/settings',
    });

    changeRightSidebarPref({
      main: 'hidden',
      secondary: 'hidden',
    });

    changeLeftSidebarSecondaryPref('hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const router = useRouter();
  const user = useUser();

  const { supabaseClient } = useSessionContext();
  const { data, updateData } = useUserData();

  const {
    leftSidebarPref,
    changeLeftSidebarMainPref,
    rightSidebarPref,
    changeRightSidebarMainPref,
  } = useAppearance();

  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);

  useEffect(() => {
    if (data) {
      setDisplayName(data?.displayName || '');
      setUsername(data?.username || '');
      setBirthday(data?.birthday ? moment(data?.birthday).toDate() : null);
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);

    await updateData?.({
      displayName,
      username,
      birthday: birthday ? moment(birthday).format('YYYY-MM-DD') : null,
    });

    setSaving(false);
  };

  const handleSignOut = async () => {
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
            value={username.replace(/[^a-z0-9_]/gi, '').toLowerCase()}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const username = event.currentTarget.value.replace(
                /[^a-z0-9_]/gi,
                ''
              );

              // Limit to 20 characters
              if (username.length > 20) return;
              setUsername(username.toLowerCase());
            }}
            icon={<IdentificationIcon className="h-5 w-5" />}
          />

          <DatePicker
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

        {data?.createdAt && (
          <div className="mt-8 border-t border-zinc-700/70 pt-4 text-zinc-500">
            You are a member of Tuturuuu since{' '}
            <span className="font-semibold text-zinc-300">
              {moment(data.createdAt).toDate().toLocaleDateString()}
            </span>{' '}
            <span className="font-semibold text-zinc-400">
              ({moment(data.createdAt).fromNow()})
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

        <div className="mt-4 hidden flex-col lg:flex">
          <div className="text-xl font-semibold text-zinc-400">Sidebars</div>
          <div className="grid h-full gap-4 text-center xl:grid-cols-2">
            <div className="flex cursor-default justify-center text-xl font-semibold text-zinc-300 lg:order-1">
              <div>Left sidebar</div>
            </div>
            <div className="flex cursor-default justify-center text-xl font-semibold text-zinc-300 lg:order-5 xl:order-2">
              <div>Right sidebar</div>
            </div>
            <div
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg border p-2 text-xl font-semibold transition duration-150 lg:order-2 xl:order-3 ${
                leftSidebarPref.main === 'closed'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 bg-zinc-300/10 text-zinc-300/80 hover:border-zinc-300/20 hover:bg-zinc-300/20 hover:text-zinc-300'
              }`}
              onClick={() => changeLeftSidebarMainPref('closed')}
            >
              Always collapsed
            </div>
            <div
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg border p-2 text-xl font-semibold transition duration-150 lg:order-6 xl:order-4 ${
                rightSidebarPref.main === 'closed'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 bg-zinc-300/10 text-zinc-300/80 hover:border-zinc-300/20 hover:bg-zinc-300/20 hover:text-zinc-300'
              }`}
              onClick={() => changeRightSidebarMainPref('closed')}
            >
              Always collapsed
            </div>
            <div
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg border p-2 text-xl font-semibold transition duration-150 lg:order-3 xl:order-5 ${
                leftSidebarPref.main === 'open'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 bg-zinc-300/10 text-zinc-300/80 hover:border-zinc-300/20 hover:bg-zinc-300/20 hover:text-zinc-300'
              }`}
              onClick={() => changeLeftSidebarMainPref('open')}
            >
              Always expanded
            </div>
            <div
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg border p-2 text-xl font-semibold transition duration-150 lg:order-7 xl:order-6 ${
                rightSidebarPref.main === 'open'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 bg-zinc-300/10 text-zinc-300/80 hover:border-zinc-300/20 hover:bg-zinc-300/20 hover:text-zinc-300'
              }`}
              onClick={() => changeRightSidebarMainPref('open')}
            >
              Always expanded
            </div>
            <div
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg border p-2 text-xl font-semibold transition duration-150 lg:order-4 xl:order-7 ${
                leftSidebarPref.main === 'auto'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 bg-zinc-300/10 text-zinc-300/80 hover:border-zinc-300/20 hover:bg-zinc-300/20 hover:text-zinc-300'
              }`}
              onClick={() => changeLeftSidebarMainPref('auto')}
            >
              Expand on hover
            </div>
            <div
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg border p-2 text-xl font-semibold transition duration-150 lg:order-8 ${
                rightSidebarPref.main === 'auto'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 bg-zinc-300/10 text-zinc-300/80 hover:border-zinc-300/20 hover:bg-zinc-300/20 hover:text-zinc-300'
              }`}
              onClick={() => changeRightSidebarMainPref('auto')}
            >
              Expand on hover
            </div>
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
            onClick={handleSignOut}
          >
            Sign out
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
  return <Layout>{page}</Layout>;
};

export default SettingPage;
