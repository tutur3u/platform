import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import UncrawledUrlsList from './uncrawled-urls';

export const metadata: Metadata = {
  title: 'Uncrawled',
  description:
    'Manage Uncrawled in the Crawlers area of your Tuturuuu workspace.',
};

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
