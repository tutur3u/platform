import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { authorizeEmployeeCreation } from './employee-creation-authorization';
import type { EmployeeCreationJournal } from './employee-creation-boundary';
import { createEmployeeCreationJournal } from './employee-creation-journal';
import { createEmployeeCreationOperationStore } from './employee-creation-operation-store';
import { createEmployeeRuntimeRpc } from './employee-creation-rpc';
import { createEmployeeRpcPhaseProvider } from './employee-creation-rpc-provider';

export async function createEmployeeRuntimeJournal(
  request: Request
): Promise<EmployeeCreationJournal | undefined> {
  try {
    const config = checkEnvVariables({ useSecretKey: true });
    const transport = createEmployeeRuntimeRpc(config);
    const admin = await createAdminClient({ noCookie: true });
    async function authorize(actorUserId: string) {
      const actor = await authorizeEmployeeCreation(request);
      return actor.authorized && actor.actorUserId === actorUserId;
    }
    const store = createEmployeeCreationOperationStore({
      rpc: transport.rpc,
      async authorize(actorUserId) {
        if (!(await authorize(actorUserId))) return null;
        const result = await admin.auth.admin.getUserById(actorUserId);
        if (result.error || result.data.user?.id !== actorUserId) return null;
        const now = Date.now();
        return {
          actorUserId,
          workspaceId: '00000000-0000-0000-0000-000000000000',
          membership: 'MEMBER',
          permission: 'manage_internal_accounts',
          email: result.data.user.email,
          emailConfirmed: Boolean(result.data.user.email_confirmed_at),
          unbanned:
            !result.data.user.banned_until ||
            Date.parse(result.data.user.banned_until) <= now,
          observedAt: now,
          expiresAt: now + 60_000,
        };
      },
    });
    const provider = createEmployeeRpcPhaseProvider({
      transport,
      auth: admin.auth.admin,
      authorize,
    });
    return createEmployeeCreationJournal({ store, provider });
  } catch {
    return undefined;
  }
}
