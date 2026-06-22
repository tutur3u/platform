/**
 * Pure, dependency-free helpers for the public profile-completion link fill
 * page. Ported verbatim (behaviour-preserving) from the legacy apps/web
 * feature so apps/tanstack-web does not import any server-only apps/web code.
 *
 * Sources:
 * - apps/web/src/features/user-profile-links/fields.ts
 *   (PROFILE_LINK_FIELDS, ProfileLinkField, isProfileLinkField)
 * - apps/web/src/features/user-profile-links/server.ts
 *   (ProfileLinkMode, getLinkUnavailableReason)
 */

/**
 * Profile fields an external user may complete through a profile-completion
 * link. Single source of truth shared by the loader and the fill UI.
 */
export const PROFILE_LINK_FIELDS = [
  'display_name',
  'full_name',
  'birthday',
  'gender',
  'avatar_url',
  'email',
  'phone',
] as const;

export type ProfileLinkField = (typeof PROFILE_LINK_FIELDS)[number];

export type ProfileLinkMode = 'per_user' | 'generic';

export function isProfileLinkField(value: string): value is ProfileLinkField {
  return (PROFILE_LINK_FIELDS as readonly string[]).includes(value);
}

/**
 * Whether a link (row from the stats view) can currently accept submissions.
 * Returns the unavailability reason, or `null` when the link is still usable.
 */
export function getLinkUnavailableReason(link: {
  is_expired?: boolean | null;
  is_full?: boolean | null;
  is_revoked?: boolean | null;
}): 'revoked' | 'expired' | 'full' | null {
  if (link.is_revoked) return 'revoked';
  if (link.is_expired) return 'expired';
  if (link.is_full) return 'full';
  return null;
}
