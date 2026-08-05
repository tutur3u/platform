import { getTranslations } from 'next-intl/server';
import { ObservabilityPanel } from '@/components/observability-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { resolveDisplayCurrency } from '@/lib/display-currency';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function RunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ currency?: string }>;
}) {
  const { wsId } = await params;
  // Read here rather than in the client, so the first paint already shows the
  // requested currency instead of flashing dollars and correcting itself.
  const currency = await resolveDisplayCurrency((await searchParams).currency);
  const t = await getTranslations('ai-studio');
  const { workspaceId } = await getAiStudioPageContext(wsId);

  return (
    <StudioPageShell
      description={t('runs-description')}
      eyebrow={t('observe')}
      title={t('runs')}
    >
      <ObservabilityPanel
        currency={currency}
        section="runs"
        workspaceId={workspaceId}
      />
    </StudioPageShell>
  );
}
