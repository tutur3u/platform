import { createFileRoute, redirect } from '@tanstack/react-router';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { TranslationsComparisonClient } from '@/components/infrastructure/translations/translations-comparison-client';
import type { TranslationMessages } from '@/components/infrastructure/translations/types';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { getMessages, resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/translations'
)({
  component: InfrastructureTranslationsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);
    const messages = getMessages(locale)['translations-inspector'];

    return createPageHead({
      description: messages.description,
      locale,
      title: messages.title,
    });
  },
  loader: async ({ params }) => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/translations`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists || workspace.workspaceId !== ROOT_WORKSPACE_ID) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const canViewInfrastructure = await hasWorkspacePermission({
      data: {
        permission: 'view_infrastructure',
        wsId: ROOT_WORKSPACE_ID,
      },
    });

    if (!canViewInfrastructure) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    return {};
  },
});

function InfrastructureTranslationsRoute() {
  return (
    <TranslationsComparisonClient
      enMessages={getMessages('en') as TranslationMessages}
      viMessages={getMessages('vi') as TranslationMessages}
    />
  );
}
