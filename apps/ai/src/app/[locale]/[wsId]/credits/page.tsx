import { getTranslations } from 'next-intl/server';
import { ObservabilityPanel } from '@/components/observability-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function CreditsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const { workspaceId } = await getAiStudioPageContext(wsId);

  return (
    <StudioPageShell
      description={t('credits-description')}
      eyebrow={t('observe')}
      title={t('credits')}
    >
      <ObservabilityPanel section="credits" workspaceId={workspaceId} />
    </StudioPageShell>
  );
}
