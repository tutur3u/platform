import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

export async function requireExternalAppRegistryAdmin(_request: Request) {
  return authorizeInfrastructureAdminRequest([
    'manage_workspace_secrets',
    'manage_workspace_roles',
  ]);
}
