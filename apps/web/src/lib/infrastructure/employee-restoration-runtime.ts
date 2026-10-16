import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  EmployeeManagementError,
  type EmployeeRestorationOperations,
  type EmployeeRestorationProvider,
} from '@tuturuuu/utils/internal-accounts/employee-restoration-boundary';
import {
  type EmployeeRestorationContext,
  makeEmployeeRestorationHandlers,
} from '@tuturuuu/utils/internal-accounts/employee-restoration-http';
import { createEmployeeRestorationOperations } from '@tuturuuu/utils/internal-accounts/employee-restoration-rpc';
import { authorizeEmployeeCreation } from './employee-creation-authorization';

/** Same request, actor and configured project throughout one invocation. */
export function createEmployeeRestorationRequestHandlers(deps: {
  authorize: typeof authorizeEmployeeCreation;
  configuration(): { url: string; key: string };
  provider(): Promise<EmployeeRestorationProvider>;
  enabled(): boolean;
  fetch?: typeof fetch;
}) {
  function handler(kind: 'restore' | 'reconcile') {
    return async (request: Request, context: EmployeeRestorationContext) => {
      let actorUserId: string | null = null;
      async function stillAuthorized(id: string) {
        if (id !== actorUserId || !deps.enabled()) return false;
        const current = await deps.authorize(request);
        if (!current.authorized && current.status === 503)
          throw new EmployeeManagementError(
            'employee_administrator_unavailable'
          );
        return current.authorized && current.actorUserId === actorUserId;
      }
      async function assertAuthority() {
        if (!actorUserId || !(await stillAuthorized(actorUserId)))
          throw new EmployeeManagementError(
            'employee_management_forbidden',
            403
          );
      }
      const handlers = makeEmployeeRestorationHandlers(async () => {
        const actor = await deps.authorize(request);
        if (!actor.authorized) return actor;
        if (!deps.enabled()) return { authorized: false, status: 503 };
        actorUserId = actor.actorUserId;
        const configuration = deps.configuration();
        const provider = await deps.provider();
        let bound: EmployeeRestorationOperations | null = null;
        let targetUserId: string | null = null;
        let dispatched = false;
        function requireBound() {
          if (!bound)
            throw new EmployeeManagementError(
              'employee_management_unavailable'
            );
          return bound;
        }
        const operations: EmployeeRestorationOperations = {
          async inspect(args) {
            if (!bound) {
              targetUserId = args.targetUserId;
              bound = createEmployeeRestorationOperations({
                ...configuration,
                actorUserId: actor.actorUserId,
                targetUserId,
                authorize: stillAuthorized,
                fetch: deps.fetch,
              });
            }
            return bound.inspect(args);
          },
          begin: (args) => requireBound().begin(args),
          markAttempt: (args) => requireBound().markAttempt(args),
          confirm: (args) => requireBound().confirm(args),
          reconcile: (args) => requireBound().reconcile(args),
        };
        return {
          authorized: true,
          input: {
            actorUserId: actor.actorUserId,
            operations,
            provider: {
              async getUserById(id) {
                await assertAuthority();
                return provider.getUserById(id);
              },
              async updateUserById(id, attributes) {
                if (
                  dispatched ||
                  id !== targetUserId ||
                  attributes.ban_duration !== 'none' ||
                  Object.keys(attributes).length !== 1
                )
                  throw new EmployeeManagementError(
                    'employee_management_unavailable'
                  );
                dispatched = true;
                await assertAuthority();
                return provider.updateUserById(id, attributes);
              },
            },
          },
        };
      });
      const response = await handlers[kind](request, context);
      if (!response.ok || !actorUserId) return response;
      try {
        await assertAuthority();
        return response;
      } catch (error) {
        const status =
          error instanceof EmployeeManagementError ? error.status : 503;
        return Response.json(
          {
            code:
              status === 403 ? 'forbidden' : 'employee_management_unavailable',
          },
          {
            status,
            headers: { 'Cache-Control': 'private, no-store, max-age=0' },
          }
        );
      }
    };
  }
  return { restore: handler('restore'), reconcile: handler('reconcile') };
}

/** Separate from CREATE; keep disabled until RESTORE-specific qualification. */
export const employeeRestorationHandlers =
  createEmployeeRestorationRequestHandlers({
    authorize: authorizeEmployeeCreation,
    configuration: () => checkEnvVariables({ useSecretKey: true }),
    async provider() {
      return (await createAdminClient({ noCookie: true })).auth.admin;
    },
    enabled: () => process.env.EMPLOYEE_RESTORATION_RUNTIME_ENABLED === 'true',
  });
