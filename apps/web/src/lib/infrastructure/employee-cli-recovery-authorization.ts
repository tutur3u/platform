import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { isRequiredMfaAppSessionAllowed } from '@tuturuuu/utils/required-mfa-app-session';
import { authorizeCurrentEmployeeActor } from './employee-creation-authorization';
import type { EmployeeCreationAuthorization } from './employee-creation-boundary';

export async function authorizeEmployeeCliRecovery(
  request: Request
): Promise<EmployeeCreationAuthorization> {
  try {
    const bearer = request.headers
      .get('authorization')
      ?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return { authorized: false, status: 401 };
    const verified = verifyCliAccessToken(bearer);
    if (!verified.ok || verified.claims.origin_app !== 'cli')
      return { authorized: false, status: 401 };
    if (!(await isRequiredMfaAppSessionAllowed(verified.claims)))
      return { authorized: false, status: 403 };
    return await authorizeCurrentEmployeeActor(request, {
      id: verified.claims.sub,
      email: verified.claims.email,
    });
  } catch {
    return { authorized: false, status: 503 };
  }
}
