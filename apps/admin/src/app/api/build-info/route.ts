import { createBuildInfoHandler } from '@tuturuuu/utils/build-info-route';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const buildInfo = createBuildInfoHandler('infrastructure');

export async function GET(request: Request) {
  const authorization = await authorizeInfrastructureAdminRequest(
    'view_infrastructure',
    true,
    request
  );
  if (!authorization.ok) return authorization.response;
  return buildInfo();
}
