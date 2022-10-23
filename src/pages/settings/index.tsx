import { ReactElement, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';
import { TextInput } from '@mantine/core';
import { CheckIcon } from '@heroicons/react/20/solid';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';
import { useSessionContext, useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';

export const getServerSideProps = withPageAuth({ redirectTo: '/login' });

const SettingPage: PageWithLayoutProps = () => {
  const { supabaseClient } = useSessionContext();

  const user = useUser();
  const { data } = useUserData();

  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState(data?.displayName || '');
  const [username, setUsername] = useState(data?.username || '');

  const handleSave = async () => {
    setSaving(true);

    await fetch('/api/user', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        display_name: displayName,
      }),
    });

    setSaving(false);
  };

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="p-4 flex flex-col border border-zinc-800/80 bg-[#19191d] rounded">
        <div className="text-3xl font-bold mb-1">Account</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage your personal account
        </div>

        <div className="grid gap-2 max-w-md">
          <TextInput
            label="Display name"
            placeholder="John Doe"
            value={displayName}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
          <TextInput
            label="Username"
            placeholder="@tuturuuu"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
          />
          <TextInput
            label="Email"
            placeholder="example@tuturuuu.com"
            value={user?.email || ''}
            readOnly
            disabled
          />
        </div>

        <div className="h-full" />

        <div
          onClick={handleSave}
          className="mt-8 col-span-full w-full p-2 flex items-center border border-blue-300/20 hover:border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/10 hover:bg-blue-300/20 text-blue-300 rounded cursor-pointer transition duration-300"
        >
          {saving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded">
        <div className="text-3xl font-bold mb-1">Appearance</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Customize the look and feel of Tuturuuu
        </div>

        <div className="text-xl font-semibold text-zinc-400 mb-2">General</div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="w-full p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
            <div>Light mode</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="w-full p-4 flex items-center border border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/20 text-blue-300 rounded cursor-pointer">
            Dark mode{' '}
            <span>
              <CheckIcon className="h-6 w-6 ml-2" />
            </span>
          </div>
        </div>

        <div className="hidden lg:flex flex-col mt-4">
          <div className="text-xl font-semibold text-zinc-400">Sidebars</div>
          <div className="h-full grid lg:grid-cols-2 gap-4">
            <div className="flex justify-center font-semibold text-xl text-zinc-300 cursor-default">
              <div>Left sidebar</div>
            </div>
            <div className="flex justify-center font-semibold text-xl text-zinc-300 cursor-default">
              <div>Right sidebar</div>
            </div>
            <div className="w-full p-4 flex items-center border border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/20 text-blue-300 rounded cursor-pointer">
              Expand on hover
              <span>
                <CheckIcon className="h-6 w-6 ml-2" />
              </span>
            </div>
            <div className="w-full p-4 flex items-center border border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/20 text-blue-300 rounded cursor-pointer">
              Expand on hover
              <span>
                <CheckIcon className="h-6 w-6 ml-2" />
              </span>
            </div>
            <div className="p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
              <div>Always expand</div>
              <div className="text-lg text-zinc-400">Coming soon</div>
            </div>
            <div className="p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
              <div>Always expand</div>
              <div className="text-lg text-zinc-400">Coming soon</div>
            </div>
            <div className="p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
              <div>Always collapse</div>
              <div className="text-lg text-zinc-400">Coming soon</div>
            </div>
            <div className="p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
              <div>Always collapse</div>
              <div className="text-lg text-zinc-400">Coming soon</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded">
        <div className="text-3xl font-bold mb-1">Security</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage your account security
        </div>

        <div className="h-full grid lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          <div className="w-full p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
            <div>Change password</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="w-full p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
            <div>Change email</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="col-span-full 2xl:col-span-1 w-full p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
            <div>Delete account</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div
            className="col-span-full w-full p-4 flex items-center border border-red-300/20 hover:border-red-300/30 justify-center font-semibold text-xl bg-red-300/10 hover:bg-red-300/20 text-red-300 rounded cursor-pointer transition duration-300"
            onClick={handleSignOut}
          >
            Sign out
          </div>
        </div>
      </div>

      <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded">
        <div className="text-3xl font-bold mb-1">Notifications</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage your notification preferences
        </div>
        <div className="h-full grid lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          <div className="w-full p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
            <div>Web notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="w-full p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
            <div>Push notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="col-span-full 2xl:col-span-1 w-full p-2 flex flex-col items-center justify-center font-semibold text-xl bg-zinc-800/70 text-zinc-700 rounded cursor-default">
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
