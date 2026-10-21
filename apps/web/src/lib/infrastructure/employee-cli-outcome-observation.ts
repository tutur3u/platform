import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { hasEmployeeRequestOrigin } from '@tuturuuu/utils/internal-accounts/employee-request-origin';
import { authorizeEmployeeCliRecovery } from './employee-cli-recovery-authorization';
import { makeEmployeeCreationObservation } from './employee-creation-observation';
import { createEmployeeRuntimeRpc } from './employee-creation-rpc';
import { employeeRequestOrigin } from './employee-request-origin';

export function observeEmployeeCliOutcome(
  request: Request,
  operationId: string
) {
  return makeEmployeeCreationObservation({
    async authorize(request) {
      const actor = await authorizeEmployeeCliRecovery(request);
      if (!actor.authorized) return actor;
      if (
        request.method !== 'GET' ||
        request.headers.get('idempotency-key') !== operationId ||
        !hasEmployeeRequestOrigin(request, employeeRequestOrigin(request))
      )
        return { authorized: false, status: 403 };
      return actor;
    },
    async connect() {
      const transport = createEmployeeRuntimeRpc(
        checkEnvVariables({ useSecretKey: true })
      );
      const admin = await createAdminClient({ noCookie: true });
      return {
        async inspect(actorId, operationId) {
          await transport.ready(actorId);
          return transport.inspect(actorId, operationId);
        },
        async identity(targetId) {
          const result = await admin.auth.admin.getUserById(targetId);
          if (result.error) throw new Error('Provider observation unavailable');
          return result.data.user;
        },
      };
    },
  })(request, operationId);
}
