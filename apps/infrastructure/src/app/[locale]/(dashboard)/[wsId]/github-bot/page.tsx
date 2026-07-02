import { Bot } from '@tuturuuu/icons';
import { resolveInternalApiUrl } from '@tuturuuu/internal-api/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listGitHubBotState } from '@/lib/infrastructure/github-bot';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { GitHubBotClient } from './github-bot-client';

export const metadata: Metadata = {
  title: 'GitHub Bot',
  description: 'Manage the Tuturuuu CI GitHub App token issuer.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureGitHubBotPage({ params }: Props) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (
    !permissions ||
    permissions.withoutPermission('manage_workspace_secrets')
  ) {
    redirect(`/${wsId}/settings`);
  }

  const [t, state] = await Promise.all([
    getTranslations('github-bot-settings'),
    listGitHubBotState(await createAdminClient({ noCookie: true })),
  ]);

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <GitHubBotClient
        initialData={state}
        tokenEndpointUrl={resolveInternalApiUrl(
          '/api/v1/infrastructure/github-bot/installation-token'
        )}
      />
    </>
  );
}
