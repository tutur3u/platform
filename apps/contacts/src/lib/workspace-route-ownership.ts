export const CONTACTS_OWNED_EXACT_ROUTES = new Set(['', 'users']);

// Route roots Contacts owns, including anything nested beneath them.
// `*` matches exactly one dynamic segment (for example, a userId).
export const CONTACTS_OWNED_ROUTE_PREFIXES = [
  'posts',
  'reports',
  'workforce',
  'users/approvals',
  'users/attendance',
  'users/database',
  'users/feedbacks',
  'users/group-tags',
  'users/groups',
  'users/guest-leads',
  'users/reports',
  'users/structure',
  'users/topic-announcements',
  'users/tutoring',
  'users/*/follow-up',
] as const;

function matchesRoutePrefix(pattern: string, segments: string[]) {
  const patternSegments = pattern.split('/');
  if (segments.length < patternSegments.length) return false;

  return patternSegments.every(
    (patternSegment, index) =>
      patternSegment === '*' || patternSegment === segments[index]
  );
}

export function isContactsOwnedWorkspaceRoute(segments: string[]) {
  const subPath = segments.join('/');

  return (
    CONTACTS_OWNED_EXACT_ROUTES.has(subPath) ||
    CONTACTS_OWNED_ROUTE_PREFIXES.some((pattern) =>
      matchesRoutePrefix(pattern, segments)
    )
  );
}
