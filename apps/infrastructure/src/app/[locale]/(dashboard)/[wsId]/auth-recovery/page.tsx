import { ShieldCheck } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { AuthRecoveryClient } from './auth-recovery-client';

export const metadata: Metadata = {
  description: 'Manage support overrides and recovery login emails.',
  title: 'Auth Recovery',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function InfrastructureAuthRecoveryPage({
  params,
}: Props) {
  const { locale, wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions || permissions.withoutPermission('view_infrastructure')) {
    redirect(`/${wsId}/settings`);
  }

  const t = await getTranslations('auth-recovery-admin');
  const canManage = !permissions.withoutPermission('manage_workspace_roles');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <AuthRecoveryClient canManage={canManage} locale={locale} />
    </>
  );
}
