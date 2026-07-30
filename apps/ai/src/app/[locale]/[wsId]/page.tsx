import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import { StudioPage } from '@/components/studio-page';
import { getAiStudioWorkspaceContext } from '@/lib/access';
import { getAiStudioOverview } from '@/lib/studio-data';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const context = await getAiStudioWorkspaceContext(wsId);
  const data = context?.permissions.containsPermission('use_ai_studio')
    ? await getAiStudioOverview({
        includeKeys: context.permissions.containsPermission('manage_ai_keys'),
        sbAdmin: await createAdminClient({ noCookie: true }),
        userId: context.user.id,
        workspaceId: context.workspace.id,
        workspaceName: context.workspace.name ?? t('studio'),
      })
    : null;

  return (
    <StudioPage
      canManageAiKeys={
        context?.permissions.containsPermission('manage_ai_keys') ?? false
      }
      data={data}
      labels={{
        activeKeys: t('active-keys'),
        activeModels: t('active-models'),
        costThisMonth: t('cost-this-month'),
        creditsUsed: t('credits-used'),
        empty: t('empty'),
        feature: t('feature'),
        model: t('model'),
        moduleReady: t('module-ready'),
        moduleReadyDescription: t('module-ready-description'),
        noActivity: t('no-activity'),
        openPlayground: t('open-playground'),
        privatePreview: t('private-preview'),
        recentRuns: t('recent-runs'),
        request: t('request'),
        status: t('status'),
        tokens: t('tokens'),
        viewAll: t('view-all'),
      }}
      section="overview"
      title={t('overview')}
      description={t('studio-description')}
      workspaceId={context?.workspace.id ?? wsId}
    />
  );
}
