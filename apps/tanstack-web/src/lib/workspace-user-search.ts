interface WorkspaceUserSearchFields {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

export function normalizeWorkspaceUserSearchText(input?: string | null) {
  return (input ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesWorkspaceUserSearch(
  user: WorkspaceUserSearchFields,
  query?: string | null
) {
  const normalizedQuery = normalizeWorkspaceUserSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeWorkspaceUserSearchText(
    [user.full_name, user.display_name, user.email, user.phone]
      .filter(Boolean)
      .join(' ')
  );

  let startIndex = 0;

  for (const token of normalizedQuery.split(' ')) {
    const matchIndex = haystack.indexOf(token, startIndex);
    if (matchIndex === -1) {
      return false;
    }

    startIndex = matchIndex + token.length;
  }

  return true;
}

export function buildWorkspaceUserSearchValue(user: WorkspaceUserSearchFields) {
  const rawSearchValue = [
    user.full_name,
    user.display_name,
    user.email,
    user.phone,
  ]
    .filter(Boolean)
    .join(' ');
  const normalizedSearchValue =
    normalizeWorkspaceUserSearchText(rawSearchValue);

  return [rawSearchValue, normalizedSearchValue].filter(Boolean).join(' ');
}
