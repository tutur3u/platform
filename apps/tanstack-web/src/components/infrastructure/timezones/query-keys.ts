export const TIMEZONES_MANAGEMENT_QUERY_KEY = [
  'infrastructure',
  'timezones',
] as const;

export function timezonesManagementQueryKey(scope?: string) {
  return scope
    ? [...TIMEZONES_MANAGEMENT_QUERY_KEY, scope]
    : TIMEZONES_MANAGEMENT_QUERY_KEY;
}
