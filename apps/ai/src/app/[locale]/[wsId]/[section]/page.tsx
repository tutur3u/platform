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
  'models',
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
  const key = section === 'models' ? 'model-policy' : section;
  const context = await getAiStudioWorkspaceContext(wsId);
  const data =
    context?.enabled && context.permissions.containsPermission('use_ai_studio')
      ? await getAiStudioOverview({
          sbAdmin: await createAdminClient({ noCookie: true }),
          workspaceId: context.workspace.id,
          workspaceName: context.workspace.name ?? t('studio'),
        })
      : null;

  return (
    <StudioPage
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
      title={t(key)}
      description={t('studio-description')}
    />
  );
}
