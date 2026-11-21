import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import { DeploymentsClient } from './deployments-client';

export default async function DeploymentsPage() {
  await connection();
  const viewer = await authorizeInfrastructureAdminRequest(
    'view_infrastructure'
  );
  if (!viewer.ok) notFound();
  // Actions need the root-workspace operator permission; the API routes
  // enforce it, and the page hides controls a viewer cannot use.
  const operator = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles'
  );
  return <DeploymentsClient canOperate={operator.ok} />;
}
