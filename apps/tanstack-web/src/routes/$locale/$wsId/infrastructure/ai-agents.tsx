import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Bot } from '@tuturuuu/icons';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api/client';
import { listAiAgents } from '@tuturuuu/internal-api/infrastructure/ai';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { AiAgentsClient } from '@/components/infrastructure/ai-agents/ai-agents-client';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type AiAgentsRouteData = Awaited<ReturnType<typeof listAiAgents>>;

const loadAiAgents = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AiAgentsRouteData> => {
    return listAiAgents(withForwardedInternalApiAuth(getRequestHeaders()));
  }
);

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute('/$locale/$wsId/infrastructure/ai-agents')(
  {
    component: InfrastructureAiAgentsRoute,
    head: ({ params }) => {
      const locale = resolveMessagesLocale(params.locale);

      return createPageHead({
        description: 'Manage apps/web-hosted AI agents for Discord and Zalo.',
        locale,
        title: 'AI Agents',
      });
    },
    loader: async ({ params }): Promise<AiAgentsRouteData> => {
      await requireCurrentUser({
        locale: params.locale,
        nextPath: `/${params.wsId}/infrastructure/ai-agents`,
      });

      const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
      if (!workspace.exists || workspace.workspaceId !== ROOT_WORKSPACE_ID) {
        redirectToWorkspaceSettings(params.locale, params.wsId);
      }

      const canManageSecrets = await hasWorkspacePermission({
        data: {
          permission: 'manage_workspace_secrets',
          wsId: ROOT_WORKSPACE_ID,
        },
      });

      if (!canManageSecrets) {
        redirectToWorkspaceSettings(params.locale, params.wsId);
      }

      return loadAiAgents();
    },
  }
);

function InfrastructureAiAgentsRoute() {
  const data = Route.useLoaderData() as AiAgentsRouteData;
  const t = useTranslations('ai-agents-settings');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <AiAgentsClient initialData={data} />
    </>
  );
}
