import UncrawledUrlsList from './uncrawled-urls';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function UncrawledUrlsPage({ params }: Props) {
  const { wsId } = await params;
  const t = await getTranslations('ws-crawlers');

  return (
    <div className="space-y-8">
      <FeatureSummary
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
        description={t('description')}
      />
      <UncrawledUrlsList wsId={wsId} />
    </div>
  );
}
