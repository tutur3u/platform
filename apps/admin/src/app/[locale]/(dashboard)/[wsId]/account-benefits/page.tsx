import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import { AccountBenefitsPanel } from './account-benefits-panel';
import { ReviewPlanPanel } from './review-plan-panel';
export default async function AccountBenefitsPage() {
  await connection();
  const access = await authorizeInfrastructureAdminRequest([
    'manage_workspace_roles',
    'manage_workspace_secrets',
  ]);
  if (!access.ok) notFound();
  return (
    <div className="space-y-6">
      {access.permissions?.containsPermission('admin') &&
        access.permissions.containsPermission('view_infrastructure') && (
          <ReviewPlanPanel requestId={crypto.randomUUID()} />
        )}
      <AccountBenefitsPanel actorId={access.user.id} />
    </div>
  );
}
