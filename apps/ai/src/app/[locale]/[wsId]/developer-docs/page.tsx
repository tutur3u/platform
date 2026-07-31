import { getTranslations } from 'next-intl/server';
import { DeveloperDocsPanel } from '@/components/developer-docs/developer-docs-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function DeveloperDocsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const { canManageAiKeys, workspaceId } = await getAiStudioPageContext(wsId);

  return (
    <StudioPageShell
      description={t('developer-docs-description')}
      title={t('developer-docs')}
    >
      <DeveloperDocsPanel
        canManageAiKeys={canManageAiKeys}
        workspaceId={workspaceId}
      />
    </StudioPageShell>
  );
}
