import GradientHeadline from '../gradient-headline';
import useTranslation from 'next-translate/useTranslation';

export default async function PrivacyPage() {
  const { t } = useTranslation('common');

  return (
    <div className="flex h-full w-full items-center justify-center text-2xl font-bold lg:text-4xl xl:text-5xl">
      <GradientHeadline>{t('coming_soon')} ✨</GradientHeadline>
    </div>
  );
}
