import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { useSegments } from '../../hooks/useSegments';
import HeaderX from '../../components/metadata/HeaderX';
import NestedLayout from '../../components/layouts/NestedLayout';
import { enforceAuthenticated } from '../../utils/serverless/enforce-authenticated';

export const getServerSideProps = enforceAuthenticated;

const SettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment([
      {
        content: 'Settings',
        href: '/settings',
      },
      {
        content: 'Security',
        href: '/settings/security',
      },
    ]);
  }, [setRootSegment]);

  const router = useRouter();

  const { supabaseClient } = useSessionContext();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="grid gap-4 pb-8 lg:grid-cols-2">
      <HeaderX label="Settings" />

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">Security</div>
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
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default SettingPage;
