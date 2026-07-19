import { UserCog } from '@tuturuuu/icons';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import type { PermissionId } from '@tuturuuu/types';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { InternalAccountsClient } from './internal-accounts-client';

const MANAGE_INTERNAL_ACCOUNTS_PERMISSION =
  'manage_internal_accounts' as PermissionId;

export const metadata: Metadata = {
  description:
    'Securely manage access and credentials for internal Tuturuuu accounts.',
  title: 'Internal Accounts',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function InternalAccountsPage({ params }: Props) {
  await connection();

  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const user = await getSatelliteAppSessionUser('infra');
  if (!user || !isExactTuturuuuDotComEmail(user.email)) notFound();

  const permissions = await getPermissions({
    user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (!permissions?.containsPermission(MANAGE_INTERNAL_ACCOUNTS_PERMISSION)) {
    notFound();
  }

  const t = await getTranslations('internal-accounts');

  return (
    <>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-foreground/5 p-4">
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-2xl">{t('title')}</h1>
        </div>
        <p className="max-w-3xl text-foreground/80">{t('description')}</p>
      </div>

      <Alert className="mt-4">
        <UserCog className="h-4 w-4" />
        <AlertTitle>{t('notice.title')}</AlertTitle>
        <AlertDescription>{t('notice.description')}</AlertDescription>
      </Alert>

      <Separator className="my-4" />
      <InternalAccountsClient />
    </>
  );
}
