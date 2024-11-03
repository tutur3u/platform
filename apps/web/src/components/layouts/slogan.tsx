'use client';

import { useTranslations } from 'next-intl';

export default function Slogan() {
  const t = useTranslations('common');

  const maximize = t('maximize');
  const productivity = t('productivity');
  const minimize = t('minimize');
  const stress = t('stress');

  return (
    <div className="text-foreground/50 text-2xl font-semibold 2xl:text-4xl">
      <span
        className={
          isDark ? 'text-green-300' : 'text-green-500 dark:text-green-300'
        }
      >
        {maximize}
      </span>{' '}
      <span
        className={
          isDark ? 'text-blue-300' : 'text-blue-500 dark:text-blue-300'
        }
      >
        {productivity}
      </span>
      ,{' '}
      <span
        className={
          isDark ? 'text-orange-300' : 'text-orange-500 dark:text-orange-300'
        }
      >
        {minimize}
      </span>{' '}
      <span
        className={isDark ? 'text-red-300' : 'text-red-500 dark:text-red-300'}
      >
        {stress}
      </span>
      .
    </div>
  );
}
