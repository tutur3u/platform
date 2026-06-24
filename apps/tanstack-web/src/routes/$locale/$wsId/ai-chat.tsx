import {
  createFileRoute,
  notFound,
  Outlet,
  useLocation,
} from '@tanstack/react-router';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'use-intl';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { Link } from '@/lib/platform/next-link-shim';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

type AiChatNavItem = {
  aliases?: string[];
  href: string;
  matchExact?: boolean;
  requireRootWorkspace?: boolean;
  title: string;
};

export const Route = createFileRoute('/$locale/$wsId/ai-chat')({
  component: AiChatLayout,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Chat in your Tuturuuu workspace.',
      locale,
      title: 'Chat',
    });
  },
  loader: async ({ location, params }) => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(params, location.pathname, 'ai-chat'),
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    await requireWorkspacePermission({
      locale: params.locale,
      permission: 'ai_chat',
      wsId: workspace.workspaceId,
    });
  },
});

function AiChatLayout() {
  const params = Route.useParams();
  const pathname = useLocation({ select: (location) => location.pathname });
  const t = useTranslations();
  const baseHref = `/${params.locale}/${params.wsId}/ai-chat`;

  if (pathname === baseHref) {
    throw notFound();
  }

  return (
    <div>
      <AiChatNavigation
        isRootWorkspace={params.wsId === ROOT_WORKSPACE_ID}
        items={[
          {
            aliases: [`/${params.locale}/${params.wsId}/chat`],
            href: `${baseHref}/new`,
            matchExact: true,
            title: t('ai_chat.new_chat'),
          },
          {
            href: `${baseHref}/chatbots`,
            requireRootWorkspace: true,
            title: t('ai_chat.chatbots'),
          },
          {
            href: `${baseHref}/my-chatbots`,
            requireRootWorkspace: true,
            title: t('ai_chat.my_chatbots'),
          },
        ]}
        pathname={pathname}
      />
      <Outlet />
    </div>
  );
}

function AiChatNavigation({
  isRootWorkspace,
  items,
  pathname,
}: {
  isRootWorkspace: boolean;
  items: AiChatNavItem[];
  pathname: string;
}) {
  return (
    <nav className="scrollbar-none mb-4 flex flex-none gap-1 overflow-x-auto font-semibold">
      {items.map((item) => {
        if (item.requireRootWorkspace && !isRootWorkspace) {
          return null;
        }

        const activeTargets = [item.href, ...(item.aliases ?? [])];
        const isActive = activeTargets.some((target) =>
          item.matchExact
            ? pathname === target
            : pathname === target || pathname.startsWith(`${target}/`)
        );

        return (
          <Link
            className={cn(
              'flex-none rounded-lg border px-3 py-1 text-sm transition md:text-base',
              isActive
                ? 'border-border bg-foreground/2.5 text-foreground dark:bg-foreground/5'
                : 'border-transparent text-foreground/70 md:hover:bg-foreground/5 md:hover:text-foreground dark:text-foreground/40'
            )}
            href={item.href}
            key={item.href}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
