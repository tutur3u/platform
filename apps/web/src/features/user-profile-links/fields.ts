/**
 * Profile fields an external user may complete through a profile-completion
 * link. This is the single source of truth shared by API validation, the
 * public submit endpoint, and the admin link-creation UI.
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

export function isProfileLinkField(value: string): value is ProfileLinkField {
  return (PROFILE_LINK_FIELDS as readonly string[]).includes(value);
}
