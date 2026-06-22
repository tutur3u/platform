import { createFileRoute, notFound } from '@tanstack/react-router';
import { Bot } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
// Import the next/link compat shim directly: the `next/link` vite alias is
// runtime-only, and `next` is not a tanstack-web dependency, so a bare
// `next/link` import fails tsc type-checking from app-local source.
import { Link } from '../../../../lib/platform/next-link-shim';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

export const Route = createFileRoute('/$locale/$wsId/ai-chat/chatbots')({
  component: ChatbotsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Chatbots in the Chat area of your Tuturuuu workspace.',
      locale,
      title: 'Chatbots',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/ai-chat/chatbots`,
    });

    // Legacy ai-chat layout getPermissions() -> notFound() when missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy ai-chat layout withoutPermission('ai_chat') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'ai_chat',
      locale: params.locale,
    });

    return workspace;
  },
});

function ChatbotsRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  const { locale, wsId } = Route.useParams();
  // `ws-ai-chatbots.*` keys resolve via the $locale layout's IntlProvider
  // (verified present in both en.json and vi.json).
  const t = useTranslations('ws-ai-chatbots');

  if (!workspace) {
    throw notFound();
  }

  return (
    <>
      <FeatureSummary
        action={
          <Link href={`/${locale}/${wsId}/ai-chat/my-chatbots/new`}>
            <Button>
              <Bot />
              {t('create')}
            </Button>
          </Link>
        }
        createDescription={t('create_description')}
        createTitle={t('create')}
        description={t('description')}
        pluralTitle={t('plural')}
        singularTitle={t('singular')}
      />
      <Separator className="my-4" />
    </>
  );
}
