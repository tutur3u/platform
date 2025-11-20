import { getTranslations } from 'next-intl/server';
import { RealtimeAnalyticsClient } from './_components/realtime-analytics-client';

export default async function RealtimePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const t = await getTranslations('realtime-analytics');
  const { wsId } = await params;

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-bold text-3xl tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Client Component */}
      <RealtimeAnalyticsClient wsId={wsId} />
    </div>
  );
}
