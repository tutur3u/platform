export function buildCalendarEventUrl(
  origin: string,
  workspaceId: string,
  event: { id: string; start_at: string }
) {
  const url = new URL(
    `/${encodeURIComponent(workspaceId)}`,
    origin.replace(/\/+$/u, '')
  );
  url.searchParams.set('date', event.start_at);
  url.searchParams.set('eventId', event.id);
  return url.toString();
}
