export const PROFILE_MEDIA_MAX_BYTES = {
  avatar: 2 * 1024 ** 2,
  banner: 5 * 1024 ** 2,
} as const;

export type ProfileMediaKind = keyof typeof PROFILE_MEDIA_MAX_BYTES;
