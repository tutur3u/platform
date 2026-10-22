import 'server-only';
import { z } from 'zod';
import { createEmployeeManagementTransport } from './employee-management-rpc';
import { isValidAdminProfileHandle } from './employee-profile-handle';
import { InternalAccountAdminError } from './errors';

const InputSchema = z.object({
  actorUserId: z.uuid(),
  targetUserId: z.uuid(),
  email: z.email(),
  operationId: z.uuid().optional(),
  expectedDisplayName: z.string().nullable(),
  expectedUsername: z.string().nullable(),
  displayName: z.string().trim().min(1).max(100),
  username: z.string().nullable(),
});
const ReceiptSchema = z.object({
  operationId: z.uuid(),
  actorUserId: z.uuid(),
  id: z.uuid(),
  email: z.email(),
  expectedDisplayName: z.string().nullable(),
  expectedUsername: z.string().nullable(),
  displayName: z.string(),
  username: z.string().nullable(),
});
const ObservationSchema = z.object({
  current: z.object({
    managed: z.literal(false),
    id: z.uuid(),
    email: z.email(),
    displayName: z.string().nullable(),
    username: z.string().nullable(),
  }),
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

/** A write acknowledgement alone is never completion proof. */
export async function updateUnmanagedEmployeeProfile(
  input: Parameters<typeof createEmployeeManagementTransport>[0] &
    z.input<typeof InputSchema>
) {
  try {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) sqlFailure('22023');
    const profile = parsed.data;
    if (
      !isValidAdminProfileHandle({
        username: profile.username,
        currentUsername: profile.expectedUsername,
      })
    )
      sqlFailure('22023');
    const call = createEmployeeManagementTransport(input);
    const tuple = {
      p_actor_id: profile.actorUserId,
      p_user_id: profile.targetUserId,
      p_email: profile.email,
      p_operation_id: profile.operationId ?? crypto.randomUUID(),
    };
    const payload = {
      ...tuple,
      p_expected_name: profile.expectedDisplayName,
      p_expected_handle: profile.expectedUsername,
      p_name: profile.displayName,
      p_handle: profile.username,
    };
    let failure: string | null = null;
    try {
      const result = await call(
        'update_unmanaged_internal_profile',
        profile.actorUserId,
        payload
      );
      if (result.error) failure = result.error.code;
    } catch {
      // Retain the original UUID: the database may have committed.
    }
    const read = await call(
      'inspect_unmanaged_internal_profile_operation',
      profile.actorUserId,
      tuple
    );
    if (read.error) sqlFailure(read.error.code);
    const observation = ObservationSchema.safeParse(read.data);
    if (!observation.success) sqlFailure('UNAVAILABLE');
    const { current, receipt } = observation.data;
    if (!receipt) sqlFailure(failure ?? 'UNAVAILABLE');
    if (
      receipt.operationId !== tuple.p_operation_id ||
      receipt.actorUserId !== profile.actorUserId ||
      receipt.id !== profile.targetUserId ||
      receipt.email !== profile.email ||
      receipt.expectedDisplayName !== profile.expectedDisplayName ||
      receipt.expectedUsername !== profile.expectedUsername ||
      receipt.displayName !== payload.p_name ||
      receipt.username !== payload.p_handle ||
      current.id !== profile.targetUserId ||
      current.email !== profile.email ||
      current.displayName !== receipt.displayName ||
      current.username !== receipt.username
    )
      sqlFailure('UNAVAILABLE');
    return { displayName: receipt.displayName, username: receipt.username };
  } catch (error) {
    if (error instanceof InternalAccountAdminError) throw error;
    sqlFailure('UNAVAILABLE');
  }
}
