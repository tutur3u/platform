import { getTranslations } from 'next-intl/server';
import { ModelPolicyPanel } from '@/components/policy/model-policy-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function ModelPolicyPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const { canManageAiPolicy, workspaceId } = await getAiStudioPageContext(wsId);

  return (
    <StudioPageShell
      description={t('model-policy-description')}
      eyebrow={t('governance')}
      title={t('model-policy')}
    >
      <ModelPolicyPanel
        canManage={canManageAiPolicy}
        workspaceId={workspaceId}
      />
    </StudioPageShell>
  );
}
