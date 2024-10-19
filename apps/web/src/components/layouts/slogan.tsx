'use client';

import { useTranslations } from 'next-intl';

export default function Slogan() {
  const t = useTranslations('common');

  const maximize = t('maximize');
  const productivity = t('productivity');
  const minimize = t('minimize');
  const stress = t('stress');

  return (
    <div className="text-foreground/50 text-2xl font-semibold md:text-4xl">
      <span className="text-dynamic-green">{maximize}</span>{' '}
      <span className="text-dynamic-blue">{productivity}</span>,{' '}
      <span className="text-dynamic-orange">{minimize}</span>{' '}
      <span className="text-dynamic-red">{stress}</span>.
    </div>
  );
}
