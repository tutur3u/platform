import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import { AccountBenefitsPanel } from './account-benefits-panel';
export default async function AccountBenefitsPage() {
  await connection();
  const access = await authorizeInfrastructureAdminRequest([
    'manage_workspace_roles',
    'manage_workspace_secrets',
  ]);
  if (!access.ok) notFound();
  return <AccountBenefitsPanel actorId={access.user.id} />;
}
