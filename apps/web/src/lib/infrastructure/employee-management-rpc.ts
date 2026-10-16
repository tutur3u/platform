import 'server-only';
import type { EmployeeInspectionTuple } from '@tuturuuu/utils/internal-accounts/employee-restoration-boundary';
import { EmployeeManagementError } from '@tuturuuu/utils/internal-accounts/employee-restoration-boundary';
import { z } from 'zod';

const SqlErrorSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{1,32}$/),
});

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new EmployeeManagementError('employee_management_unavailable');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) {
        void reader.cancel().catch(() => {});
        throw new EmployeeManagementError('employee_management_unavailable');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

/** This port exposes inspection only, never a restore or creation RPC. */
export function createEmployeeManagementReader(input: {
  url: string;
  key: string;
  authorize(actorUserId: string): Promise<boolean>;
  fetch?: typeof fetch;
}) {
  const origin = new URL(input.url);
  if (
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(origin.hostname)
      )) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    !input.key
  )
    throw new EmployeeManagementError('employee_management_unavailable');
  const fetcher = input.fetch ?? globalThis.fetch;
  return {
    async inspect(args: EmployeeInspectionTuple) {
      const { actorUserId, targetUserId, email } = args;
      if (!(await input.authorize(actorUserId)))
        return { data: null, error: { code: '42501' } };
      const response = await fetcher(
        new URL('/rest/v1/rpc/inspect_employee_management', origin),
        {
          method: 'POST',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
          headers: {
            apikey: input.key,
            Authorization: `Bearer ${input.key}`,
            'Content-Type': 'application/json',
            'Content-Profile': 'private',
            'Accept-Profile': 'private',
            Prefer: 'tx=commit',
          },
          body: JSON.stringify({
            p_actor_id: actorUserId,
            p_user_id: targetUserId,
            p_email: email,
          }),
        }
      );
      const data = await readJson(response);
      if (!response.ok) {
        const error = SqlErrorSchema.safeParse(data);
        return {
          data: null,
          error: { code: error.success ? error.data.code : 'UNAVAILABLE' },
        };
      }
      return { data, error: null };
    },
  };
}
