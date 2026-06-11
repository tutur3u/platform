import type { CalendarCategoriesReorderPayload } from '../platform-calendar';
import {
  type CalendarCommandInput,
  getCalendarPayload,
  getCategoryPayload,
  getEventPayload,
  parseIsoDateTime,
  parseJsonPayload,
  pickString,
  requireId,
} from './calendar-payloads';
import { render } from './render';

export async function handleEvents(
  input: CalendarCommandInput,
  action: string
) {
  const { client, flags, json, positionals, workspaceId } = input;
  const eventId = positionals[3];

  if (action === 'list') {
    const start_at = parseIsoDateTime(
      pickString(flags, 'start', 'start-at'),
      '--start'
    );
    const end_at = parseIsoDateTime(
      pickString(flags, 'end', 'end-at'),
      '--end'
    );
    if (!start_at || !end_at) {
      throw new Error('Calendar events list requires --start and --end.');
    }

    render(
      await client.calendar.listEvents(workspaceId, { start_at, end_at }),
      {
        calendarResource: 'events',
        group: 'calendar',
        json,
      }
    );
    return;
  }

  if (action === 'get') {
    render(
      await client.calendar.getEvent(
        workspaceId,
        requireId(eventId, 'event', action)
      ),
      { calendarResource: 'events', group: 'calendar', json }
    );
    return;
  }

  if (action === 'create') {
    render(
      await client.calendar.createEvent(
        workspaceId,
        getEventPayload(flags, positionals, { create: true })
      ),
      { calendarResource: 'events', group: 'calendar', json }
    );
    return;
  }

  if (action === 'update') {
    render(
      await client.calendar.updateEvent(
        workspaceId,
        requireId(eventId, 'event', action),
        getEventPayload(flags, positionals)
      ),
      { calendarResource: 'events', group: 'calendar', json }
    );
    return;
  }

  if (action === 'delete') {
    render(
      await client.calendar.deleteEvent(
        workspaceId,
        requireId(eventId, 'event', action)
      ),
      { calendarResource: 'events', group: 'calendar', json }
    );
    return;
  }

  throw new Error(`Unknown calendar events action: ${action}`);
}

export async function handleCalendars(
  input: CalendarCommandInput,
  action: string
) {
  const { client, flags, json, positionals, workspaceId } = input;
  const calendarId = positionals[3];

  if (action === 'list') {
    render(await client.calendar.listCalendars(workspaceId), {
      calendarResource: 'calendars',
      group: 'calendar',
      json,
    });
    return;
  }

  if (action === 'create') {
    render(
      await client.calendar.createCalendar(
        workspaceId,
        getCalendarPayload(flags, positionals, { create: true })
      ),
      { calendarResource: 'calendars', group: 'calendar', json }
    );
    return;
  }

  if (action === 'update') {
    render(
      await client.calendar.updateCalendar(
        workspaceId,
        getCalendarPayload(flags, positionals, {
          id: requireId(calendarId, 'calendar', action),
        })
      ),
      { calendarResource: 'calendars', group: 'calendar', json }
    );
    return;
  }

  if (action === 'delete') {
    render(
      await client.calendar.deleteCalendar(
        workspaceId,
        requireId(calendarId, 'calendar', action)
      ),
      { calendarResource: 'calendars', group: 'calendar', json }
    );
    return;
  }

  if (action === 'reset') {
    if (flags.yes !== true) {
      throw new Error('Calendar reset is destructive. Re-run with --yes.');
    }

    render(await client.calendar.resetCalendars(workspaceId), {
      calendarResource: 'calendars',
      group: 'calendar',
      json,
    });
    return;
  }

  throw new Error(`Unknown calendar calendars action: ${action}`);
}

export async function handleCategories(
  input: CalendarCommandInput,
  action: string
) {
  const { client, flags, json, positionals, workspaceId } = input;
  const categoryId = positionals[3];

  if (action === 'list') {
    render(await client.calendar.listCategories(workspaceId), {
      calendarResource: 'categories',
      group: 'calendar',
      json,
    });
    return;
  }

  if (action === 'create') {
    render(
      await client.calendar.createCategory(
        workspaceId,
        getCategoryPayload(flags, positionals, { create: true })
      ),
      { calendarResource: 'categories', group: 'calendar', json }
    );
    return;
  }

  if (action === 'update') {
    render(
      await client.calendar.updateCategory(
        workspaceId,
        requireId(categoryId, 'category', action),
        getCategoryPayload(flags, positionals)
      ),
      { calendarResource: 'categories', group: 'calendar', json }
    );
    return;
  }

  if (action === 'delete') {
    render(
      await client.calendar.deleteCategory(
        workspaceId,
        requireId(categoryId, 'category', action)
      ),
      { calendarResource: 'categories', group: 'calendar', json }
    );
    return;
  }

  if (action === 'reorder') {
    const payload = parseJsonPayload(
      flags
    ) as unknown as CalendarCategoriesReorderPayload;
    if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
      throw new Error(
        'Calendar category reorder requires --json-payload with a categories array.'
      );
    }

    render(await client.calendar.reorderCategories(workspaceId, payload), {
      calendarResource: 'categories',
      group: 'calendar',
      json,
    });
    return;
  }

  throw new Error(`Unknown calendar categories action: ${action}`);
}
