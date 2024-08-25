import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations('common');

  return (
    <div className="flex items-center justify-center p-8 font-semibold">
      {t('loading')}...
    </div>
  );
}
