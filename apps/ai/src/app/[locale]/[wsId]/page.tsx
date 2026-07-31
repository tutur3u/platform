import { ArrowUpRight } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { OverviewPanel } from '@/components/overview/overview-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioWorkspaceContext } from '@/lib/access';
import { getAiStudioOverview } from '@/lib/studio-data';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const home = await getTranslations('ai-studio.home');
  const context = await getAiStudioWorkspaceContext(wsId);
  const canManageAiKeys =
    context?.permissions.containsPermission('manage_ai_keys') ?? false;
  const workspaceId = context?.workspace.id ?? wsId;
  const data = context?.permissions.containsPermission('use_ai_studio')
    ? await getAiStudioOverview({
        includeKeys: canManageAiKeys,
        sbAdmin: await createAdminClient({ noCookie: true }),
        userId: context.user.id,
        workspaceId: context.workspace.id,
        workspaceName: context.workspace.name ?? t('studio'),
      })
    : null;

  return (
    <StudioPageShell
      actions={
        <Button asChild>
          <Link href={`/${workspaceId}/playground`}>
            {t('open-playground')}
            <ArrowUpRight className="ml-2 size-4" />
          </Link>
        </Button>
      }
      badge={home('month_to_date')}
      description={t('overview-description')}
      eyebrow={t('private-preview')}
      title={t('overview')}
    >
      <OverviewPanel
        canManageAiKeys={canManageAiKeys}
        canManageAiPolicy={
          context?.permissions.containsPermission('manage_ai_policy') ?? false
        }
        data={data}
        workspaceId={workspaceId}
      />
    </StudioPageShell>
  );
}
