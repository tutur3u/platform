import { getTranslations } from 'next-intl/server';
import { HorseRacingVisualization } from '@/components/visualizations/horse-racing/visualization';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.visualizations_horse_racing',
  pathname: '/visualizations/horse-racing',
});

export default async function HorseRacingPage() {
  const t = await getTranslations('marketingSeo.visualizations_horse_racing');
  return (
    <div className="p-4 md:p-8 lg:p-16 xl:px-32">
      <div className="mb-10 space-y-4">
        <h1 className="font-bold text-2xl tracking-tight md:text-4xl">
          {t('title')}
        </h1>
        <p className="text-lg text-muted-foreground">{t('bodyDescription')}</p>
      </div>
      <HorseRacingVisualization />
    </div>
  );
}
