import { ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';
import { TextInput } from '@mantine/core';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';
import { useSessionContext, useUser } from '@supabase/auth-helpers-react';
import { useUserData } from '../../hooks/useUserData';
import { useRouter } from 'next/router';
import { useAppearance } from '../../hooks/useAppearance';

export const getServerSideProps = withPageAuth({
  redirectTo: '/login?nextUrl=/settings',
});

const SettingPage: PageWithLayoutProps = () => {
  const router = useRouter();
  const user = useUser();

  const { supabaseClient } = useSessionContext();
  const { data, updateData } = useUserData();
  const {
    contentWidth,
    changeContentWidth,
    leftSidebar,
    changeLeftSidebar,
    rightSidebar,
    changeRightSidebar,
  } = useAppearance();

  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (data) {
      setDisplayName(data?.displayName || '');
      setUsername(data?.username || '');
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);

    if (!updateData) {
      setSaving(false);
      throw new Error('No updateData function');
    }

    await updateData({
      displayName,
      username,
    });

    setSaving(false);
  };

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="p-4 flex flex-col border border-zinc-800/80 bg-[#19191d] rounded-lg">
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
          className="mt-8 col-span-full w-full p-2 flex items-center border border-blue-300/20 hover:border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/10 hover:bg-blue-300/20 text-blue-300 rounded-lg cursor-pointer transition duration-300"
        >
          {saving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded-lg">
        <div className="text-3xl font-bold mb-1">Appearance</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Customize the look and feel of Tuturuuu
        </div>

        <div className="text-xl font-semibold text-zinc-400 mb-2">General</div>
        <div className="grid text-center xl:grid-cols-2 gap-4">
          <div className="w-full p-2 flex flex-col items-center justify-center border border-zinc-300/10 font-semibold text-xl bg-zinc-300/5 text-zinc-300/20 rounded-lg cursor-not-allowed">
            <div>Light mode</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="w-full p-2 flex items-center border border-blue-300/30 justify-center font-semibold text-xl bg-blue-300/20 text-blue-300 rounded-lg cursor-pointer">
            Dark mode
          </div>
        </div>

        {changeContentWidth && (
          <>
            <div className="text-xl font-semibold text-zinc-400 mt-4 mb-2">
              Content
            </div>
            <div className="grid text-center xl:grid-cols-2 gap-4">
              <div
                onClick={() => changeContentWidth('full')}
                className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 ${
                  contentWidth === 'full'
                    ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                    : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
                }`}
              >
                Full width
              </div>
              <div
                onClick={() => changeContentWidth('padded')}
                className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 ${
                  contentWidth === 'padded'
                    ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                    : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
                }`}
              >
                Padded width
              </div>
            </div>
          </>
        )}

        <div className="hidden lg:flex flex-col mt-4">
          <div className="text-xl font-semibold text-zinc-400">Sidebars</div>
          <div className="h-full text-center grid xl:grid-cols-2 gap-4">
            <div className="flex justify-center font-semibold text-xl text-zinc-300 cursor-default lg:order-1">
              <div>Left sidebar</div>
            </div>
            <div className="flex justify-center font-semibold text-xl text-zinc-300 cursor-default lg:order-5 xl:order-2">
              <div>Right sidebar</div>
            </div>
            <div
              className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 lg:order-2 xl:order-3 ${
                leftSidebar === 'closed'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
              }`}
              onClick={() => changeLeftSidebar('closed')}
            >
              Always collapsed
            </div>
            <div
              className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 lg:order-6 xl:order-4 ${
                rightSidebar === 'closed'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
              }`}
              onClick={() => changeRightSidebar('closed')}
            >
              Always collapsed
            </div>
            <div
              className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 lg:order-3 xl:order-5 ${
                leftSidebar === 'open'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
              }`}
              onClick={() => changeLeftSidebar('open')}
            >
              Always expanded
            </div>
            <div
              className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 lg:order-7 xl:order-6 ${
                rightSidebar === 'open'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
              }`}
              onClick={() => changeRightSidebar('open')}
            >
              Always expanded
            </div>
            <div
              className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 lg:order-4 xl:order-7 ${
                leftSidebar === 'auto'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
              }`}
              onClick={() => changeLeftSidebar('auto')}
            >
              Expand on hover
            </div>
            <div
              className={`w-full p-2 flex items-center border justify-center font-semibold text-xl rounded-lg cursor-pointer transition duration-150 lg:order-8 ${
                rightSidebar === 'auto'
                  ? 'border-blue-300/30 bg-blue-300/20 text-blue-300'
                  : 'border-zinc-300/10 hover:border-zinc-300/20 bg-zinc-300/10 hover:bg-zinc-300/20 text-zinc-300/80 hover:text-zinc-300'
              }`}
              onClick={() => changeRightSidebar('auto')}
            >
              Expand on hover
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded-lg">
        <div className="text-3xl font-bold mb-1">Security</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage your account security
        </div>

        <div className="h-full text-center grid xl:grid-cols-2 gap-4">
          <div className="w-full p-2 flex flex-col items-center justify-center border border-zinc-300/10 font-semibold text-xl bg-zinc-300/5 text-zinc-300/20 rounded-lg cursor-not-allowed">
            <div>Change password</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="w-full p-2 flex flex-col items-center justify-center border border-zinc-300/10 font-semibold text-xl bg-zinc-300/5 text-zinc-300/20 rounded-lg cursor-not-allowed">
            <div>Change email</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="col-span-full w-full p-2 flex flex-col items-center justify-center border border-zinc-300/10 font-semibold text-xl bg-zinc-300/5 text-zinc-300/20 rounded-lg cursor-not-allowed">
            <div>Delete account</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div
            className="col-span-full w-full p-2 flex items-center border border-red-300/20 hover:border-red-300/30 justify-center font-semibold text-xl bg-red-300/10 hover:bg-red-300/20 text-red-300 rounded-lg cursor-pointer transition duration-300"
            onClick={handleSignOut}
          >
            Sign out
          </div>
        </div>
      </div>

      <div className="flex flex-col p-4 border border-zinc-800/80 bg-[#19191d] rounded-lg">
        <div className="text-3xl font-bold mb-1">Notifications</div>
        <div className="font-semibold text-zinc-500 mb-4">
          Manage your notification preferences
        </div>
        <div className="h-full text-center grid xl:grid-cols-2 gap-4">
          <div className="w-full p-2 flex flex-col items-center justify-center border border-zinc-300/10 font-semibold text-xl bg-zinc-300/5 text-zinc-300/20 rounded-lg cursor-not-allowed">
            <div>Web notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="w-full p-2 flex flex-col items-center justify-center border border-zinc-300/10 font-semibold text-xl bg-zinc-300/5 text-zinc-300/20 rounded-lg cursor-not-allowed">
            <div>Push notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="col-span-full w-full p-2 flex flex-col items-center justify-center border border-zinc-300/10 font-semibold text-xl bg-zinc-300/5 text-zinc-300/20 rounded-lg cursor-not-allowed">
            <div>Email notifications</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
        </div>
      </div>

      <div className="h-64" />
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout label="Settings">{page}</Layout>;
};

export default SettingPage;
