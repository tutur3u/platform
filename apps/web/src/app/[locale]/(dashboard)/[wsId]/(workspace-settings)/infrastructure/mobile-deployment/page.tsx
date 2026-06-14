import { Rocket } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MOBILE_DEPLOYMENT_VAULT_PERMISSION } from '@/lib/mobile-deployment/constants';
import { listMobileDeploymentState } from '@/lib/mobile-deployment/store';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { MobileDeploymentClient } from './mobile-deployment-client';

export const metadata: Metadata = {
  title: 'Mobile Deployment',
  description: 'Manage production mobile deployment vault resources.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureMobileDeploymentPage({
  params,
}: Props) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (
    !permissions ||
    permissions.withoutPermission(MOBILE_DEPLOYMENT_VAULT_PERMISSION)
  ) {
    redirect(`/${wsId}/settings`);
  }

  const [t, state] = await Promise.all([
    getTranslations('mobile-deployment-settings'),
    listMobileDeploymentState(await createAdminClient({ noCookie: true })),
  ]);

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <MobileDeploymentClient initialData={state} />
    </>
  );
}
