const FALLBACK_SEARCH_COLUMNS = [
  'title',
  'user_full_name',
  'user_display_name',
  'user_email',
  'group_name',
  'creator_full_name',
  'creator_display_name',
  'creator_email',
] as const;

export function isMissingReportSearchRpc(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return ['42883', 'PGRST202'].includes(String(error.code));
}

export function buildPeriodicReportFallbackFilter(query: string) {
  const escaped = query
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
  const pattern = `"%${escaped}%"`;

  return FALLBACK_SEARCH_COLUMNS.map(
    (column) => `${column}.ilike.${pattern}`
  ).join(',');
}
