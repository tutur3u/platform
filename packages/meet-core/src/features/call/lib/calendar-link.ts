function trimTrailingSlashes(value: string) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

export function buildCalendarEventUrl(
  origin: string,
  workspaceId: string,
  event: { id: string; start_at: string }
) {
  const url = new URL(
    `/${encodeURIComponent(workspaceId)}`,
    trimTrailingSlashes(origin)
  );
  url.searchParams.set('date', event.start_at);
  url.searchParams.set('eventId', event.id);
  return url.toString();
}
