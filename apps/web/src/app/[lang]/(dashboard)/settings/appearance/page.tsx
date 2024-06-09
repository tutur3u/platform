'use client';

import SettingItemCard from '../../../../../components/settings/SettingItemCard';
import { useAppearance } from '@/hooks/useAppearance';
import useTranslation from 'next-translate/useTranslation';

export default function SettingPage() {
  const { t } = useTranslation('settings-appearance');

  const appearance = t('appearance');

  const appearanceDescription = t('appearance-description');

  const darkMode = t('dark-mode');
  const lightMode = t('light-mode');

  const { theme, changeTheme } = useAppearance();

  return (
    <SettingItemCard
      title={appearance}
      description={appearanceDescription}
      className="w-full max-w-2xl"
    >
      <div className="grid gap-4 text-center md:grid-cols-2">
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
  );
}
