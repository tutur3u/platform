import GradientHeadline from '../../gradient-headline';
import { useTranslations } from 'next-intl';

export default function RealEstatePage() {
  const t = useTranslations('common');

  return (
    <div className="flex h-screen w-full items-center justify-center text-2xl font-bold lg:text-4xl xl:text-5xl">
      <GradientHeadline>{t('coming_soon')} ✨</GradientHeadline>
    </div>
  );
}
