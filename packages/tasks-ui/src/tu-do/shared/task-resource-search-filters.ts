import { normalizeBoardText } from '../boards/boardId/board-text-utils';

export function labelNameMatchesQuery(
  name: string | null | undefined,
  query: string
): boolean {
  return !query || normalizeBoardText(name).includes(normalizeBoardText(query));
}

export function projectNameMatchesQuery(
  name: string | null | undefined,
  query: string
): boolean {
  return labelNameMatchesQuery(name, query);
}

export function memberMatchesSearchQuery(
  member: { display_name?: string | null; email?: string | null },
  query: string
): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (member.display_name?.toLowerCase().includes(q) ?? false) ||
    (member.email?.toLowerCase().includes(q) ?? false)
  );
}
