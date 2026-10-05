import type { Client } from '@microsoft/microsoft-graph-client';

const GRAPH_ORIGIN = 'https://graph.microsoft.com';
const MAX_PAGES = 50;
const MAX_EVENTS = 25_000;

/** Refuse partial snapshots: callers reconcile deletions against this result. */
export async function fetchCalendarViewPages<T extends { id: string }>(
  client: Client,
  calendarId: string,
  startDateTime: string,
  endDateTime: string
): Promise<T[]> {
  const path = `/me/calendars/${encodeURIComponent(calendarId)}/calendarView`;
  const events = new Map<string, T>();
  const visited = new Set<string>();
  let next: string | undefined = path;
  for (let page = 0; next; page++) {
    if (page >= MAX_PAGES || visited.has(next)) {
      throw new Error('Microsoft calendar pagination limit or loop detected');
    }
    visited.add(next);
    let request = client.api(next).header('Prefer', 'outlook.timezone="UTC"');
    if (page === 0) {
      request = request.query({
        startDateTime,
        endDateTime,
        $top: 500,
        $orderby: 'start/dateTime',
      });
    }
    const response = await request.get();
    if (!response || !Array.isArray(response.value)) {
      throw new Error('Invalid Microsoft calendar page');
    }
    for (const event of response.value as T[]) {
      if (!event || typeof event.id !== 'string' || !event.id) {
        throw new Error('Microsoft calendar page contains an invalid event');
      }
      events.set(event.id, event);
      if (events.size > MAX_EVENTS) {
        throw new Error('Microsoft calendar event limit exceeded');
      }
    }
    const link: unknown = response['@odata.nextLink'];
    if (link === undefined || link === null) {
      next = undefined;
    } else {
      if (typeof link !== 'string' || !link) {
        throw new Error('Invalid Microsoft calendar continuation');
      }
      const url = new URL(link);
      // Never forward the bearer token to another host, collection or calendar.
      if (
        url.origin !== GRAPH_ORIGIN ||
        url.username ||
        url.password ||
        url.hash ||
        decodeURIComponent(url.pathname) !== decodeURIComponent(`/v1.0${path}`)
      ) {
        throw new Error('Unsafe Microsoft calendar continuation');
      }
      next = url.href;
    }
  }
  return [...events.values()];
}
