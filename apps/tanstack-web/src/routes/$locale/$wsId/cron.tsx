import { createFileRoute, notFound } from '@tanstack/react-router';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../lib/platform/workspace-permission';

export const Route = createFileRoute('/$locale/$wsId/cron')({
  component: CronRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Cron in your Tuturuuu workspace.',
      locale,
      title: 'Cron',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy layout getCurrentUser() runs after
    // the permission gate, but auth must resolve to a real session regardless.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/cron`,
    });

    // Legacy layout getPermissions() -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy layout withoutPermission('ai_lab') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'ai_lab',
      locale: params.locale,
    });

    return workspace;
  },
});

function CronRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  // `sidebar_tabs.cron` and `ws-cron.description` resolve via the $locale
  // layout's IntlProvider (verified present in both en.json and vi.json).
  const t = useTranslations();

  if (!workspace) {
    throw notFound();
  }

  // Shell: the FeatureSummary header is a shared @tuturuuu/ui component that
  // needs no server data. The legacy page's two statistic cards
  // (JobsStatistics / ExecutionStatistics) render app-local
  // `@/components/cards/StatisticCard` and hard-require server-side Supabase
  // counts over `workspace_cron_jobs` / `workspace_cron_executions` with no
  // `@tuturuuu/internal-api` forwarded-auth reader yet — the same Phase-2
  // data-origin gap noted for the other migrated dashboard routes — so they
  // are intentionally omitted from this shell.
  return (
    <>
      <FeatureSummary
        pluralTitle={t('sidebar_tabs.cron')}
        singularTitle={t('sidebar_tabs.cron')}
        description={t('ws-cron.description')}
      />
      <Separator className="my-4" />
    </>
  );
}
