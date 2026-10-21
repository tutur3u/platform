import { employeeRequestOrigin } from './employee-request-origin';
import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { createEmployeeAddressMigrationHandler } from './employee-address-migration-handler';
import { authorizeEmployeeCreation } from './employee-creation-authorization';

export function createEmployeeAddressMigrationRequestHandlers(
  deps: Omit<
    Parameters<typeof createEmployeeAddressMigrationHandler>[0],
    'trustedOrigin'
  >
) {
  function handler(
    action:
      | 'inspect'
      | 'migrate'
      | 'prepare'
      | 'retained-inspect'
      | 'adopt-retained'
  ) {
    return (request: Request) =>
      createEmployeeAddressMigrationHandler({
        ...deps,
        trustedOrigin: employeeRequestOrigin(request),
      })(request, action);
  }
  return {
    inspect: handler('inspect'),
    migrate: handler('migrate'),
    prepare: handler('prepare'),
    inspectRetained: handler('retained-inspect'),
    adoptRetained: handler('adopt-retained'),
  };
}

export const employeeAddressMigrationHandlers =
  createEmployeeAddressMigrationRequestHandlers({
    authorize: authorizeEmployeeCreation,
    configuration: () => checkEnvVariables({ useSecretKey: true }),
    async admin() {
      return (await createAdminClient({ noCookie: true })).auth.admin;
    },
    newAttemptId: () => crypto.randomUUID(),
  });
