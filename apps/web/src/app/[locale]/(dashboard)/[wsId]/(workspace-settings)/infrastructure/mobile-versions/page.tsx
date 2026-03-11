import { Smartphone } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  enforceRootWorkspaceAdmin,
  getPermissions,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMobileVersionPolicies } from '@/lib/mobile-version-policy';
import { MobileVersionSettingsForm } from './mobile-version-settings-form';

export const metadata: Metadata = {
  title: 'Mobile Versions',
  description: 'Manage enforced mobile app versions for iOS and Android.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureMobileVersionsPage({
  params,
}: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions || permissions.withoutPermission('manage_workspace_roles')) {
    redirect(`/${wsId}/settings`);
  }

  const [t, policies] = await Promise.all([
    getTranslations('mobile-version-settings'),
    getMobileVersionPolicies(),
  ]);

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <MobileVersionSettingsForm initialData={policies} />
    </>
  );
}
