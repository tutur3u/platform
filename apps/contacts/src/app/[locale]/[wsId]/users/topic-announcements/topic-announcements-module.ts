/**
 * Whether the topic announcements module is on, using exactly the rule the
 * topic APIs apply (`resolveTopicAnnouncementsAccess`): the workspace secret
 * must be the string 'true'. A looser check would mount the module where
 * every request 404s.
 */
export function isTopicAnnouncementsModuleEnabled(
  value: string | null | undefined
) {
  return value === 'true';
}
