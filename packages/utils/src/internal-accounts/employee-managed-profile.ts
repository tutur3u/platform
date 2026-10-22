import 'server-only';
import { z } from 'zod';
import { createEmployeeManagementTransport } from './employee-management-rpc';
import { isValidAdminProfileHandle } from './employee-profile-handle';
import { InternalAccountAdminError } from './errors';

const CurrentSchema = z.discriminatedUnion('managed', [
  z.object({ managed: z.literal(false) }),
  z.object({
    managed: z.literal(true),
    ready: z.boolean(),
    revision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    id: z.uuid(),
    email: z.email(),
    displayName: z.string().min(1).max(100),
    username: z.string().nullable(),
  }),
]);
const ReceiptSchema = z.object({
  operationId: z.uuid(),
  actorUserId: z.uuid(),
  id: z.uuid(),
  email: z.email(),
  expectedRevision: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  displayName: z.string().min(1).max(100),
  username: z.string().nullable(),
});
const ObservationSchema = z.object({
  current: CurrentSchema,
  receipt: ReceiptSchema.nullable(),
});

function sqlFailure(code: string): never {
  const status =
    code === '42501'
      ? 403
      : code === 'PT429'
        ? 429
        : ['23505', '23514'].includes(code)
          ? 409
          : code === '22023'
            ? 400
            : 503;
  throw new InternalAccountAdminError(
    status === 429
      ? 'Profile change limit reached. Try again later.'
      : status === 409
        ? 'The profile changed or the username is unavailable. Reload and try again.'
        : status === 400
          ? 'The profile name or username is invalid.'
          : status === 403
            ? 'Forbidden'
            : 'Unable to verify the profile update',
    status
  );
}

/** One atomic write, followed by independent committed-state observation.
 * A lost acknowledgement reads the original operation; it never retries a write.
 */
export async function updateManagedEmployeeProfile(
  input: Parameters<typeof createEmployeeManagementTransport>[0] & {
    actorUserId: string;
    targetUserId: string;
    email: string;
    displayName: string;
    username: string | null;
    operationId?: string;
  }
) {
  const call = createEmployeeManagementTransport(input);
  const tuple = {
    p_actor_id: z.uuid().parse(input.actorUserId),
    p_user_id: z.uuid().parse(input.targetUserId),
    p_email: z.email().parse(input.email),
  };
  const initial = await call(
    'inspect_employee_profile',
    input.actorUserId,
    tuple
  );
  if (initial.error) sqlFailure(initial.error.code);
  const preimage = CurrentSchema.parse(initial.data);
  if (!preimage.managed) return null;
  if (
    !preimage.ready ||
    preimage.id !== input.targetUserId ||
    preimage.email !== input.email
  )
    sqlFailure('23514');
  if (
    !isValidAdminProfileHandle({
      username: input.username,
      currentUsername: preimage.username,
    })
  )
    sqlFailure('22023');
  const payload = {
    ...tuple,
    p_expected_revision: preimage.revision,
    p_operation_id: input.operationId ?? crypto.randomUUID(),
    p_name: z.string().trim().min(1).max(100).parse(input.displayName),
    p_handle: input.username,
  };
  let failure: string | null = null;
  try {
    const result = await call(
      'update_employee_profile',
      input.actorUserId,
      payload
    );
    if (result.error) failure = result.error.code;
  } catch {
    // The database may have committed. Observe exactly this operation below.
  }
  const read = await call(
    'inspect_employee_profile_operation',
    input.actorUserId,
    {
      ...tuple,
      p_operation_id: payload.p_operation_id,
    }
  );
  if (read.error) sqlFailure(read.error.code);
  const { current, receipt } = ObservationSchema.parse(read.data);
  if (!receipt) sqlFailure(failure ?? 'UNAVAILABLE');
  if (
    !current.managed ||
    !current.ready ||
    current.id !== input.targetUserId ||
    current.email !== input.email ||
    receipt.operationId !== payload.p_operation_id ||
    receipt.actorUserId !== input.actorUserId ||
    receipt.id !== input.targetUserId ||
    receipt.email !== input.email ||
    receipt.expectedRevision !== preimage.revision ||
    receipt.revision !== preimage.revision + 1 ||
    current.revision !== receipt.revision ||
    receipt.displayName !== payload.p_name ||
    current.displayName !== receipt.displayName ||
    receipt.username !== payload.p_handle ||
    current.username !== receipt.username
  )
    sqlFailure('UNAVAILABLE');
  return { displayName: current.displayName, username: current.username };
}
