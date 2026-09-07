import { getTranslations } from 'next-intl/server';
import { IntegrationsPanel } from '@/components/integrations-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { resolveDisplayCurrency } from '@/lib/display-currency';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ currency?: string }>;
}) {
  const { workspaceId } = await getAiStudioPageContext((await params).wsId);
  const currency = await resolveDisplayCurrency((await searchParams).currency);
  const t = await getTranslations('ai-studio');
  return (
    <StudioPageShell
      title={t('integrations')}
      description={t('integrations-page.description')}
      eyebrow={t('observe')}
    >
      <IntegrationsPanel workspaceId={workspaceId} currency={currency} />
    </StudioPageShell>
  );
}
