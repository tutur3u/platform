import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
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
        content: 'Notifications',
        href: '/settings/notifications',
      },
    ]);
  }, [setRootSegment]);

  return (
    <div className="grid gap-4 pb-20 lg:grid-cols-2">
      <HeaderX label="Settings" />

      <div className="flex flex-col rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="mb-1 text-2xl font-bold">Notifications</div>
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
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default SettingPage;
