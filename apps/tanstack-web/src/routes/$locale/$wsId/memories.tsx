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

export const Route = createFileRoute('/$locale/$wsId/memories')({
  component: MemoriesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Explore AI memories in your Tuturuuu workspace.',
      locale,
      title: 'Memories',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/memories`,
    });

    // Legacy getWorkspace()/getPermissions() -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('ai_lab') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'ai_lab',
      locale: params.locale,
    });

    return workspace;
  },
});

function MemoriesRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  // `ws-memories` namespace resolves via the $locale layout's IntlProvider;
  // the plural/singular/description keys exist in both en.json and vi.json.
  const t = useTranslations('ws-memories');

  if (!workspace) {
    throw notFound();
  }

  // The legacy leaf (`MemoriesClient`) is an app-local `apps/web` client that
  // imports `@tuturuuu/internal-api/ai-memory` and is NOT published in
  // `@tuturuuu/ui`, so it cannot be imported here. This shell migrates the
  // shared, data-free header (FeatureSummary + Separator); the interactive
  // memory explorer stays a Phase-2 follow-up once a shared client exists.
  return (
    <>
      <FeatureSummary
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
        description={t('description')}
      />
      <Separator className="my-4" />
    </>
  );
}
