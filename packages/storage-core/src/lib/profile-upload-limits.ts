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
  // Cross-workspace cap per actor, so one actor with many workspaces cannot
  // multiply the per-workspace budget and drain the managed global.
  actorPerDay: 600,
  actorBytesPerDay: 1200 * 1024 ** 2,
  // Own platform-wide ceilings (half the shared profile ceilings), so bulk admin
  // work cannot starve self-profile uploads.
  globalPerDay: 5000,
  globalBytesPerDay: 8 * 1024 ** 3,
} as const;
