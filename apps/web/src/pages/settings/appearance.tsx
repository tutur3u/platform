import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { useSegments } from '../../hooks/useSegments';
import HeaderX from '../../components/metadata/HeaderX';
import NestedLayout from '../../components/layouts/NestedLayout';

const SettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment([
      {
        content: 'Settings',
        href: '/settings',
      },
      {
        content: 'Appearance',
        href: '/settings/appearance',
      },
    ]);
  }, [setRootSegment]);

  return (
    <div className="grid gap-4 pb-8">
      <HeaderX label="Settings" />

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">Appearance</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Customize the look and feel of Tuturuuu
        </div>

        <div className="mb-2 text-xl font-semibold text-zinc-400">General</div>
        <div className="grid gap-4 text-center xl:grid-cols-2">
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Light mode</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="flex w-full cursor-pointer items-center justify-center rounded border border-blue-300/30 bg-blue-300/20 p-2 text-xl font-semibold text-blue-300">
            Dark mode
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
