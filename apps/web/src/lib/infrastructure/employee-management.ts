import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  assertEmployeeServiceActor,
  EmployeeManagementError,
  employeeNextAction,
  inspectEmployeeManagement,
  providerState,
  readEmployeeProvider,
} from '@tuturuuu/utils/internal-accounts/employee-restoration-boundary';
import { z } from 'zod';
import { authorizeEmployeeCreation as authorizeEmployeeAdministrator } from './employee-creation-authorization';
import { createEmployeeManagementReader } from './employee-management-rpc';

function reply(status: number, body: object) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
function denial(status: number, code = 'employee_management_unavailable') {
  return reply(status, { code });
}

export async function readInternalEmployeeManagement(
  request: Request,
  context: { params: PromiseLike<{ userId: string }> }
) {
  try {
    const actor = await authorizeEmployeeAdministrator(request);
    if (!actor.authorized)
      return denial(
        actor.status,
        actor.status === 401
          ? 'unauthorized'
          : actor.status === 403
            ? 'forbidden'
            : undefined
      );
    const { userId } = await context.params;
    if (!z.uuid().safeParse(userId).success)
      return denial(400, 'invalid_request');
    if (userId === actor.actorUserId)
      return denial(409, 'employee_self_action');
    async function stillAuthorized(actorUserId: string) {
      const current = await authorizeEmployeeAdministrator(request);
      return current.authorized && current.actorUserId === actorUserId;
    }
    const admin = await createAdminClient({ noCookie: true });
    const operations = createEmployeeManagementReader({
      ...checkEnvVariables({ useSecretKey: true }),
      authorize: stillAuthorized,
    });
    const input = {
      actorUserId: actor.actorUserId,
      targetUserId: userId,
      provider: admin.auth.admin,
      operations,
    };
    await assertEmployeeServiceActor(input);
    const user = await readEmployeeProvider(input);
    const providerReadAt = new Date().toISOString();
    const observation = await inspectEmployeeManagement(input, user);
    if (!(await stillAuthorized(actor.actorUserId)))
      return denial(403, 'forbidden');
    if (
      !user &&
      observation.registryState === 'absent' &&
      observation.reservation === 'none'
    )
      return denial(404, 'employee_not_found');
    const state = providerState(user);
    return reply(200, {
      ...observation,
      providerState: state,
      providerReadAt,
      nextAction: employeeNextAction(
        observation,
        state,
        user?.app_metadata?.employee_onboarding === true
      ),
    });
  } catch (error) {
    if (
      error instanceof EmployeeManagementError &&
      [403, 404, 409].includes(error.status)
    )
      return denial(error.status, error.code);
    return denial(503);
  }
}
