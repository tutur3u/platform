import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiKeysPanel } from '@/components/api-keys-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const { canManageAiKeys, workspaceId } = await getAiStudioPageContext(wsId);
  if (!canManageAiKeys) notFound();

  return (
    <StudioPageShell
      description={t('api-keys-description')}
      eyebrow={t('governance')}
      title={t('api-keys')}
    >
      <ApiKeysPanel workspaceId={workspaceId} />
    </StudioPageShell>
  );
}
