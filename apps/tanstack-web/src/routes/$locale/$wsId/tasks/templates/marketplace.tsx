import { createFileRoute, notFound } from '@tanstack/react-router';
import { ArrowLeft, Globe } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import MarketplaceClient from '@tuturuuu/ui/tu-do/templates/marketplace/client';
import type { BoardTemplate } from '@tuturuuu/ui/tu-do/templates/types';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

const TEMPLATES_BASE_PATH = 'tasks/templates';
const EMPTY_TEMPLATES: BoardTemplate[] = [];

export const Route = createFileRoute(
  '/$locale/$wsId/tasks/templates/marketplace'
)({
  component: MarketplaceRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Discover templates from the community.',
      locale,
      title: 'Template Marketplace',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/templates/marketplace`,
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

function MarketplaceRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  const { locale } = Route.useParams();
  // `ws-board-templates` namespace resolves via the $locale layout's IntlProvider.
  const t = useTranslations('ws-board-templates');

  if (!workspace) {
    throw notFound();
  }

  // Locale-prefixed to match tanstack-web's routing convention (legacy was
  // locale-less under Next.js middleware).
  const backToTemplatesUrl = `/${locale}/${workspace.workspaceId}/${TEMPLATES_BASE_PATH}`;

  // Legacy prefetches `templates` server-side via a direct Supabase query;
  // MarketplaceClient renders its grid from that prop and degrades to a valid
  // empty-state shell when none are passed, so an empty initial set is
  // functionally correct here. (No forwarded-auth internal-api reader for
  // public board templates exists yet — the same Phase-2 data-origin gap.)
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="mb-4 gap-2 pl-0">
          <a href={backToTemplatesUrl}>
            <ArrowLeft className="h-4 w-4" />
            {t('marketplace.back_to_templates')}
          </a>
        </Button>
        <FeatureSummary
          title={
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-linear-to-br from-dynamic-purple/10 to-dynamic-blue/10 p-3 text-dynamic-purple">
                <Globe className="h-7 w-7" />
              </div>
              <h1 className="font-bold text-2xl tracking-tight">
                {t('marketplace.header')}
              </h1>
            </div>
          }
          description={t('marketplace.description')}
        />
      </div>
      <MarketplaceClient
        wsId={workspace.workspaceId}
        templates={EMPTY_TEMPLATES}
        templatesBasePath={TEMPLATES_BASE_PATH}
      />
    </div>
  );
}
