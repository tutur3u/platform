import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import { PRODUCTION_INTERNAL_APP_DOMAINS } from '@tuturuuu/utils/internal-domains';

/** A satellite origin is admitted only with its independently verified bearer. */
export function employeeRequestOrigin(request: Request): string {
  const destination = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin === destination || origin === null) return destination;
  const configured = PRODUCTION_INTERNAL_APP_DOMAINS.some(
    (app) => app.name === 'infra' && app.url === origin
  );
  const credential = request.headers.get('authorization');
  if (!configured || !credential || !/^Bearer ttr_app_\S+$/i.test(credential))
    return destination;
  const claims = getAppSessionClaimsFromRequest(
    { headers: new Headers({ authorization: credential }) },
    { targetApp: 'infra' }
  );
  return claims ? origin : destination;
}
