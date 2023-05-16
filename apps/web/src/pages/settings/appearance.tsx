import { ReactElement, useEffect } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { useSegments } from '../../hooks/useSegments';
import HeaderX from '../../components/metadata/HeaderX';
import NestedLayout from '../../components/layouts/NestedLayout';
import SettingItemCard from '../../components/settings/SettingItemCard';
import { enforceAuthenticated } from '../../utils/serverless/enforce-authenticated';
import useTranslation from 'next-translate/useTranslation';
import { useAppearance } from '../../hooks/useAppearance';

export const getServerSideProps = enforceAuthenticated;

const SettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  const { t } = useTranslation('settings-appearance');

  const settings = t('common:settings');
  const appearance = t('appearance');

  useEffect(() => {
    setRootSegment([
      {
        content: settings,
        href: '/settings',
      },
      {
        content: appearance,
        href: '/settings/appearance',
      },
    ]);
  }, [settings, appearance, setRootSegment]);

  const appearanceDescription = t('appearance-description');

  const darkMode = t('dark-mode');
  const lightMode = t('light-mode');

  const { theme, changeTheme } = useAppearance();

  return (
    <div className="grid gap-4 pb-20 lg:grid-cols-2">
      <HeaderX label={settings} />

      <SettingItemCard title={appearance} description={appearanceDescription}>
        <div className="grid gap-4 text-center xl:grid-cols-2">
          <div
            onClick={() => changeTheme('dark')}
            className={`flex w-full cursor-pointer items-center justify-center rounded border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-600 transition dark:border-blue-300/30 dark:bg-blue-300/20 dark:text-blue-300 ${
              theme === 'dark' ? '' : 'opacity-50 hover:opacity-80'
            }`}
          >
            {darkMode}
          </div>
          <div
            onClick={() => changeTheme('light')}
            className={`flex w-full cursor-pointer items-center justify-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-600 transition dark:border-blue-300/30 dark:bg-blue-300/20 dark:text-blue-300 ${
              theme === 'light' ? '' : 'opacity-50 hover:opacity-80'
            }`}
          >
            {lightMode}
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
