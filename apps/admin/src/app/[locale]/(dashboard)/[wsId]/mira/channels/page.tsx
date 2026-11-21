import { Bot } from '@tuturuuu/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { MIRA_OPERATOR_PERMISSION } from '@/lib/mira-channels/authorize';
import { enforceInfrastructureRootWorkspace } from '../../enforce-infrastructure-root';
import { MiraChannelsClient } from './mira-channels-client';

export const metadata: Metadata = {
  description: 'Health, cost and stop state of every Mira channel tenant.',
  title: 'Mira channels',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function MiraChannelsOperatorPage({ params }: Props) {
  await connection();
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (
    !permissions ||
    permissions.withoutPermission('admin') ||
    permissions.withoutPermission(MIRA_OPERATOR_PERMISSION)
  ) {
    notFound();
  }

  const t = await getTranslations('mira-channels');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="font-bold text-2xl">{t('title')}</h1>
      </div>
      <MiraChannelsClient />
    </div>
  );
}
