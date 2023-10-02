import useTranslation from 'next-translate/useTranslation';

export default function Loading() {
  const { t } = useTranslation('common');

  return (
    <div className="flex h-screen w-screen items-center justify-center font-semibold">
      {t('loading')}...
    </div>
  );
}
