import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { useSegments } from '../../hooks/useSegments';
import HeaderX from '../../components/metadata/HeaderX';
import NestedLayout from '../../components/layouts/NestedLayout';
import { enforceAuthenticated } from '../../utils/serverless/enforce-authenticated';
import useTranslation from 'next-translate/useTranslation';
import SettingItemCard from '../../components/settings/SettingItemCard';

export const getServerSideProps = enforceAuthenticated;

const SettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  const { t } = useTranslation('settings-security');

  const settings = t('common:settings');
  const security = t('security');

  useEffect(() => {
    setRootSegment([
      {
        content: settings,
        href: '/settings',
      },
      {
        content: security,
        href: '/settings/security',
      },
    ]);
  }, [settings, security, setRootSegment]);

  const router = useRouter();

  const { supabaseClient } = useSessionContext();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  const securityDescription = t('security-description');
  const changePassword = t('change-password');
  const changeEmail = t('change-email');
  const deleteAccount = t('delete-account');

  const comingSoon = t('common:coming-soon');
  const logOut = t('common:logout');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HeaderX label={settings} />

      <SettingItemCard title={security} description={securityDescription}>
        <div className="grid h-full gap-4 text-center xl:grid-cols-2">
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-500/10 bg-zinc-500/5 p-2 font-semibold text-zinc-500/40 dark:border-zinc-300/10 dark:bg-zinc-300/5 dark:text-zinc-300/20">
            <div>{changePassword}</div>
            <div className="text-sm text-zinc-700 dark:text-zinc-400">
              {comingSoon}
            </div>
          </div>
          <div className="flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-500/10 bg-zinc-500/5 p-2 font-semibold text-zinc-500/40 dark:border-zinc-300/10 dark:bg-zinc-300/5 dark:text-zinc-300/20">
            <div>{changeEmail}</div>
            <div className="text-sm text-zinc-700 dark:text-zinc-400">
              {comingSoon}
            </div>
          </div>
          <div className="col-span-full flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-zinc-500/10 bg-zinc-500/5 p-2 font-semibold text-zinc-500/40 dark:border-zinc-300/10 dark:bg-zinc-300/5 dark:text-zinc-300/20">
            <div>{deleteAccount}</div>
            <div className="text-sm text-zinc-700 dark:text-zinc-400">
              {comingSoon}
            </div>
          </div>
          <div
            className="col-span-full flex w-full cursor-pointer items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 p-2 font-semibold text-red-600 transition duration-300 hover:border-red-500/30 hover:bg-red-500/20 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:border-red-300/30 dark:hover:bg-red-300/20"
            onClick={handleLogout}
          >
            {logOut}
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
