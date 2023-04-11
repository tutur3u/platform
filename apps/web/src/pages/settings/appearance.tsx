import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { useSegments } from '../../hooks/useSegments';
import HeaderX from '../../components/metadata/HeaderX';
import NestedLayout from '../../components/layouts/NestedLayout';
import SettingItemCard from '../../components/settings/SettingItemCard';
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
        content: 'Appearance',
        href: '/settings/appearance',
      },
    ]);
  }, [setRootSegment]);

  return (
    <div className="grid gap-4 pb-8 md:grid-cols-2">
      <HeaderX label="Settings" />

      <SettingItemCard
        title="Appearance"
        description="Customize the look and feel of Tuturuuu."
      >
        <div className="grid gap-4 text-center xl:grid-cols-2">
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 text-xl font-semibold text-zinc-300/20">
            <div>Light mode</div>
            <div className="text-lg text-zinc-400">Coming soon</div>
          </div>
          <div className="flex w-full cursor-pointer items-center justify-center rounded border border-blue-300/30 bg-blue-300/20 p-2 text-xl font-semibold text-blue-300">
            Dark mode
          </div>
        </div>
      </SettingItemCard>
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default SettingPage;
