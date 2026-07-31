import { getTranslations } from 'next-intl/server';
import { ObservabilityPanel } from '@/components/observability-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function RunsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const { workspaceId } = await getAiStudioPageContext(wsId);

  return (
    <StudioPageShell
      description={t('runs-description')}
      eyebrow={t('observe')}
      title={t('runs')}
    >
      <ObservabilityPanel section="runs" workspaceId={workspaceId} />
    </StudioPageShell>
  );
}
