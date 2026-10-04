import 'server-only';
import { createHash } from 'node:crypto';
import { ProfileUploadError } from './profile-upload-error';

import {
  reserveSecurityBudget,
  type SecurityBudgetDimension,
} from './security-budget';

export { ProfileUploadError } from './profile-upload-error';

export type ProfileMediaKind = 'avatar' | 'banner';
export const PROFILE_MEDIA_MAX_BYTES = {
  avatar: 2 * 1024 ** 2,
  banner: 5 * 1024 ** 2,
} as const;

/** Charge the bucket ceiling, never an untrusted client byte count. Tickets count even if unused. */
export async function reserveProfileUploadBudget(
  actorId: string,
  kind: ProfileMediaKind,
  now = new Date()
) {
  const actor = createHash('sha256').update(actorId).digest('hex');
  const time = now.getTime();
  const hour = Math.floor(time / 3600000);
  const day = Math.floor(time / 86400000);
  // Calendar weeks start Monday, UTC.
  const week = Math.floor((day + 3) / 7);
  const prefix = 'api-cost:v1:profile-upload';
  const bytes = PROFILE_MEDIA_MAX_BYTES[kind];
  const specs = [
    [`${prefix}:actor:${actor}:hour:${hour}`, 1, 2, 7200, (hour + 1) * 3600000],
    [
      `${prefix}:actor:${actor}:${kind}:day:${day}`,
      1,
      kind === 'avatar' ? 3 : 2,
      172800,
      (day + 1) * 86400000,
    ],
    [
      `${prefix}:actor:${actor}:week:${week}`,
      1,
      10,
      8 * 86400,
      ((week + 1) * 7 - 3) * 86400000,
    ],
    [
      `${prefix}:actor:${actor}:bytes:day:${day}`,
      bytes,
      16 * 1024 ** 2,
      172800,
      (day + 1) * 86400000,
    ],
    [
      `${prefix}:actor:${actor}:bytes:week:${week}`,
      bytes,
      32 * 1024 ** 2,
      8 * 86400,
      ((week + 1) * 7 - 3) * 86400000,
    ],
    [`${prefix}:global:day:${day}`, 1, 10000, 172800, (day + 1) * 86400000],
    [
      `${prefix}:global:bytes:day:${day}`,
      bytes,
      16 * 1024 ** 3,
      172800,
      (day + 1) * 86400000,
    ],
  ] as const;
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
