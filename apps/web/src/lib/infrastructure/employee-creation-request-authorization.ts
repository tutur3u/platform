import { authorizeEmployeeCliRecovery } from './employee-cli-recovery-authorization';
import { authorizeEmployeeCreation } from './employee-creation-authorization';
import type { EmployeeCreationAuthorization } from './employee-creation-boundary';
import {
  employeeCreationCliClaims,
  hasBoundCliMfaProof,
} from './employee-creation-cli';

/**
 * Employee creation (`POST /employees`) and its availability probe. With
 * EMPLOYEE_CREATION_CLI_ENABLED=true, a verified `ttr login` access token is
 * admitted only with a bound MFA proof (always, whatever the operator's
 * policy) and then the CLI recovery checks: required-MFA policy, verified
 * staff identity matching the token, root `MEMBER` and
 * `manage_internal_accounts`. Every other credential, and every CLI token
 * while the flag is off, keeps the unchanged infra/admin path.
 */
export async function authorizeEmployeeCreationRequest(
  request: Request
): Promise<EmployeeCreationAuthorization> {
  let claims: ReturnType<typeof employeeCreationCliClaims>;
  try {
    claims = employeeCreationCliClaims(request);
  } catch {
    return { authorized: false, status: 503 };
  }
  if (!claims) return authorizeEmployeeCreation(request);
  try {
    if (!(await hasBoundCliMfaProof(claims)))
      return { authorized: false, status: 403 };
  } catch {
    return { authorized: false, status: 503 };
  }
  return authorizeEmployeeCliRecovery(request);
}
