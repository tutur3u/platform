'use client';
import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations('lettin');
  return (
    <p role="status" className="p-10">
      {t('loading')}
    </p>
  );
}
