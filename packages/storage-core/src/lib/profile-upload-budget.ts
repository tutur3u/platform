import 'server-only';
import { createHash } from 'node:crypto';
import { ProfileUploadError } from './profile-upload-error';
import {
  PROFILE_MEDIA_MAX_BYTES,
  type ProfileMediaKind,
  WORKSPACE_MANAGED_AVATAR_LIMITS,
} from './profile-upload-limits';

import {
  reserveSecurityBudget,
  type SecurityBudgetDimension,
} from './security-budget';

export { ProfileUploadError } from './profile-upload-error';
export {
  PROFILE_MEDIA_MAX_BYTES,
  type ProfileMediaKind,
} from './profile-upload-limits';

type BudgetSpec = readonly [
  key: string,
  amount: number,
  maximum: number,
  ttl: number,
  resetAtMs: number,
];

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** UTC calendar windows: hour, day and Monday-based week. */
function budgetWindows(time: number) {
  const hour = Math.floor(time / 3600000);
  const day = Math.floor(time / 86400000);
  // Calendar weeks start Monday, UTC.
  const week = Math.floor((day + 3) / 7);
  return {
    hour,
    day,
    week,
    hourEnd: (hour + 1) * 3600000,
    dayEnd: (day + 1) * 86400000,
    weekEnd: ((week + 1) * 7 - 3) * 86400000,
  };
}

/** Reserve every spec atomically; a denial reports the first exhausted window. */
async function reserveSpecs(specs: readonly BudgetSpec[], time: number) {
  let result: [number, number];
  try {
    result = await reserveSecurityBudget(
      specs.map(
        ([key, amount, maximum, ttl]) =>
          [key, amount, maximum, ttl] as SecurityBudgetDimension
      )
    );
  } catch {
    throw new ProfileUploadError(
      'Profile upload protection is unavailable',
      503
    );
  }
  if (result[0] === 0) {
    const denied = specs[result[1] - 1];
    if (!denied)
      throw new ProfileUploadError(
        'Profile upload protection is unavailable',
        503
      );
    throw new ProfileUploadError(
      'Profile upload limit reached',
      429,
      Math.max(1, Math.ceil((denied[4] - time) / 1000))
    );
  }
}

/** Charge the source upload ceiling, never an untrusted client byte count. Tickets count even if unused. */
export async function reserveProfileUploadBudget(
  actorId: string,
  kind: ProfileMediaKind,
  now = new Date()
) {
  const actor = sha256(actorId);
  const time = now.getTime();
  const { hour, day, week, hourEnd, dayEnd, weekEnd } = budgetWindows(time);
  const prefix = 'api-cost:v1:profile-upload';
  const bytes = PROFILE_MEDIA_MAX_BYTES[kind];
  await reserveSpecs(
    [
      [`${prefix}:actor:${actor}:hour:${hour}`, 1, 2, 7200, hourEnd],
      [
        `${prefix}:actor:${actor}:${kind}:day:${day}`,
        1,
        kind === 'avatar' ? 3 : 2,
        172800,
        dayEnd,
      ],
      [`${prefix}:actor:${actor}:week:${week}`, 1, 10, 8 * 86400, weekEnd],
      [
        `${prefix}:actor:${actor}:bytes:day:${day}`,
        bytes,
        16 * 1024 ** 2,
        172800,
        dayEnd,
      ],
      [
        `${prefix}:actor:${actor}:bytes:week:${week}`,
        bytes,
        32 * 1024 ** 2,
        8 * 86400,
        weekEnd,
      ],
      [`${prefix}:global:day:${day}`, 1, 10000, 172800, dayEnd],
      [
        `${prefix}:global:bytes:day:${day}`,
        bytes,
        16 * 1024 ** 3,
        172800,
        dayEnd,
      ],
    ],
    time
  );
}

/**
 * Charge an admin uploading an avatar for a workspace-managed user. Keyed per
 * workspace and actor, separate from the self-profile counters, with the much
 * higher WORKSPACE_MANAGED_AVATAR_LIMITS, plus an actor-only cross-workspace
 * cap and the managed global ceilings. The RPC allows 8 dimensions, so there is
 * no separate weekly byte counter: it would equal perWeek x the 2 MiB charge.
 * Callers must have authorized the actor
 * for `workspaceId` first; the key only partitions budgets, it grants nothing.
 */
export async function reserveWorkspaceManagedAvatarBudget(
  workspaceId: string,
  actorId: string,
  now = new Date()
) {
  const actor = sha256(actorId);
  const scope = `ws:${sha256(workspaceId)}:actor:${actor}`;
  const time = now.getTime();
  const { hour, day, week, hourEnd, dayEnd, weekEnd } = budgetWindows(time);
  const prefix = 'api-cost:v1:profile-upload:ws-user-avatar';
  const bytes = PROFILE_MEDIA_MAX_BYTES.avatar;
  const limits = WORKSPACE_MANAGED_AVATAR_LIMITS;
  await reserveSpecs(
    [
      [`${prefix}:${scope}:hour:${hour}`, 1, limits.perHour, 7200, hourEnd],
      [`${prefix}:${scope}:day:${day}`, 1, limits.perDay, 172800, dayEnd],
      [
        `${prefix}:${scope}:week:${week}`,
        1,
        limits.perWeek,
        8 * 86400,
        weekEnd,
      ],
      [
        `${prefix}:${scope}:bytes:day:${day}`,
        bytes,
        limits.bytesPerDay,
        172800,
        dayEnd,
      ],
      // Actor-only, across every workspace the actor manages.
      [
        `${prefix}:actor:${actor}:day:${day}`,
        1,
        limits.actorPerDay,
        172800,
        dayEnd,
      ],
      [
        `${prefix}:actor:${actor}:bytes:day:${day}`,
        bytes,
        limits.actorBytesPerDay,
        172800,
        dayEnd,
      ],
      [`${prefix}:global:day:${day}`, 1, limits.globalPerDay, 172800, dayEnd],
      [
        `${prefix}:global:bytes:day:${day}`,
        bytes,
        limits.globalBytesPerDay,
        172800,
        dayEnd,
      ],
    ],
    time
  );
}

/** Atomically consume a short-lived ticket once, before reading or decoding bytes. */
export async function consumeProfileUploadTicket(ticketId: string) {
  let result: [number, number];
  try {
    result = await reserveSecurityBudget([
      [`api-cost:v1:profile-upload:ticket:${ticketId}`, 1, 1, 1200],
    ]);
  } catch {
    throw new ProfileUploadError(
      'Profile upload protection is unavailable',
      503
    );
  }
  if (result[0] === 0)
    throw new ProfileUploadError('Upload ticket has already been used', 409);
}
