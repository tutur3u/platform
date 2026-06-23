import { createFileRoute, notFound } from '@tanstack/react-router';
import { Store } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import TemplatesClient from '@tuturuuu/ui/tu-do/templates/client';
import type { BoardTemplate } from '@tuturuuu/ui/tu-do/templates/types';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

const TEMPLATES_BASE_PATH = 'tasks/templates';
const EMPTY_TEMPLATES: BoardTemplate[] = [];

function getWorkspaceNextPath(
  params: { locale: string; wsId: string },
  pathname: string
) {
  const localePrefix = `/${params.locale}`;

  if (pathname.startsWith(`${localePrefix}/`)) {
    return pathname.slice(localePrefix.length);
  }

  return `/${params.wsId}/${TEMPLATES_BASE_PATH}`;
}

export const Route = createFileRoute('/$locale/$wsId/tasks/templates')({
  component: TemplatesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Browse and manage board templates in your Tuturuuu workspace.',
      locale,
      title: 'Board Templates',
    });
  },
  loader: async ({ location, params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(params, location.pathname),
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('manage_projects') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'manage_projects',
      locale: params.locale,
    });

    return workspace;
  },
});

function TemplatesRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  const { locale } = Route.useParams();
  // `ws-board-templates` namespace resolves via the $locale layout's IntlProvider.
  const t = useTranslations('ws-board-templates');

  if (!workspace) {
    throw notFound();
  }

  // Locale-prefixed to match tanstack-web's routing convention (legacy was
  // locale-less under Next.js middleware).
  const marketplaceUrl = `/${locale}/${workspace.workspaceId}/${TEMPLATES_BASE_PATH}/marketplace`;

  // Legacy prefetches `initialTemplates` server-side; TemplatesClient renders
  // its grid from that prop and self-loads source boards via TanStack Query
  // (listWorkspaceTaskBoards) only when the create dialog opens, so an empty
  // initial set is functionally correct here. (Client-side /api fetches hit an
  // origin tanstack-web does not serve yet — the same Phase-2 data-origin gap.)
  return (
    <div className="space-y-6">
      <FeatureSummary
        title={
          <h1 className="font-bold text-2xl tracking-tight">
            {t('gallery.header')}
          </h1>
        }
        description={t('gallery.description')}
        action={
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={marketplaceUrl}>
              <Store className="h-4 w-4" />
              {t('gallery.marketplace')}
            </a>
          </Button>
        }
      />
      <TemplatesClient
        wsId={workspace.workspaceId}
        initialTemplates={EMPTY_TEMPLATES}
        templatesBasePath={TEMPLATES_BASE_PATH}
      />
    </div>
  );
}
