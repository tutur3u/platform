export const PROFILE_MEDIA_MAX_BYTES = {
  avatar: 2 * 1024 ** 2,
  banner: 5 * 1024 ** 2,
} as const;

export type ProfileMediaKind = keyof typeof PROFILE_MEDIA_MAX_BYTES;

/**
 * Budget for avatars that an admin uploads for workspace-managed users (CRM
 * contacts, students). Unlike self-profile uploads (2/hour, 3 avatars/day per
 * actor), one admin legitimately updates many people in a sitting, so this
 * pool is much larger. It is keyed per workspace AND actor and is fully
 * separate from the self-profile counters. Tickets still count even when
 * unused, and each is charged the avatar source ceiling in bytes.
 */
export const WORKSPACE_MANAGED_AVATAR_LIMITS = {
  perHour: 60,
  perDay: 300,
  perWeek: 1000,
  bytesPerDay: 600 * 1024 ** 2,
  bytesPerWeek: 2000 * 1024 ** 2,
  // Own platform-wide ceilings, so bulk admin work cannot starve self-profile
  // uploads; same values as the shared profile ceilings.
  globalPerDay: 10000,
  globalBytesPerDay: 16 * 1024 ** 3,
} as const;
