import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StudioPage } from '@/components/studio-page';
import { getAiStudioWorkspaceContext } from '@/lib/access';
import { getAiStudioOverview } from '@/lib/studio-data';

const sections = new Set([
  'playground',
  'prompts',
  'agents',
  'datasets',
  'evaluations',
  'experiments',
  'api-keys',
  'model-policy',
  'runs',
  'logs',
  'usage',
  'credits',
]);

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string; wsId: string }>;
}) {
  const { section, wsId } = await params;
  if (!sections.has(section)) notFound();

  const t = await getTranslations('ai-studio');
  const titles: Record<string, string> = {
    agents: t('agents'),
    'api-keys': t('api-keys'),
    credits: t('credits'),
    datasets: t('datasets'),
    evaluations: t('evaluations'),
    experiments: t('experiments'),
    logs: t('logs'),
    'model-policy': t('model-policy'),
    playground: t('playground'),
    prompts: t('prompts'),
    runs: t('runs'),
    usage: t('usage'),
  };
  const context = await getAiStudioWorkspaceContext(wsId);
  if (
    section === 'api-keys' &&
    !context?.permissions.containsPermission('manage_ai_keys')
  ) {
    notFound();
  }
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
        recentRuns: t('recent-runs'),
        request: t('request'),
        status: t('status'),
        tokens: t('tokens'),
      }}
      section={section}
      title={titles[section] ?? t('studio')}
      description={t('studio-description')}
      workspaceId={context?.workspace.id ?? wsId}
    />
  );
}
