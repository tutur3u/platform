import {
  type CalendarCommandInput,
  getConnectionPayload,
  getSchedulePayload,
  getSourcePayload,
  pickString,
  requireId,
} from './calendar-payloads';
import { render } from './render';

export async function handleAccounts(
  input: CalendarCommandInput,
  action: string
) {
  const { client, json, positionals, workspaceId } = input;
  const accountId = positionals[3];

  if (action === 'list') {
    render(await client.calendar.listAccounts(workspaceId), {
      calendarResource: 'accounts',
      group: 'calendar',
      json,
    });
    return;
  }

  if (action === 'disconnect' || action === 'delete') {
    render(
      await client.calendar.disconnectAccount(
        workspaceId,
        requireId(accountId, 'account', action)
      ),
      { calendarResource: 'accounts', group: 'calendar', json }
    );
    return;
  }

  throw new Error(`Unknown calendar accounts action: ${action}`);
}

export async function handleAuth(
  input: CalendarCommandInput,
  provider?: string
) {
  const { client, json, workspaceId } = input;

  if (provider === 'google') {
    render(await client.calendar.getGoogleAuthUrl(workspaceId), {
      calendarResource: 'auth',
      group: 'calendar',
      json,
    });
    return;
  }

  if (provider === 'microsoft') {
    render(await client.calendar.getMicrosoftAuthUrl(workspaceId), {
      calendarResource: 'auth',
      group: 'calendar',
      json,
    });
    return;
  }

  throw new Error('Calendar auth requires google or microsoft.');
}

export async function handleProviderCalendars(
  input: CalendarCommandInput,
  action: string
) {
  const { client, flags, json, workspaceId } = input;

  if (action === 'list') {
    render(
      await client.calendar.listProviderCalendars(workspaceId, {
        accountId: pickString(flags, 'account', 'account-id'),
      }),
      { calendarResource: 'provider-calendars', group: 'calendar', json }
    );
    return;
  }

  throw new Error(`Unknown calendar provider-calendars action: ${action}`);
}

export async function handleConnections(
  input: CalendarCommandInput,
  action: string
) {
  const { client, flags, json, positionals, workspaceId } = input;
  const connectionId = positionals[3];

  if (action === 'list') {
    render(await client.calendar.listConnections(workspaceId), {
      calendarResource: 'connections',
      group: 'calendar',
      json,
    });
    return;
  }

  if (action === 'create') {
    const payload = getConnectionPayload(flags);
    if (!payload.calendarId || !payload.calendarName) {
      throw new Error(
        'Calendar connection create requires --calendar-id and --calendar-name.'
      );
    }

    render(await client.calendar.createConnection(workspaceId, payload), {
      calendarResource: 'connections',
      group: 'calendar',
      json,
    });
    return;
  }

  if (action === 'update') {
    render(
      await client.calendar.updateConnection(
        getConnectionPayload(flags, {
          id: requireId(connectionId, 'connection', action),
        })
      ),
      { calendarResource: 'connections', group: 'calendar', json }
    );
    return;
  }

  if (action === 'delete') {
    render(
      await client.calendar.deleteConnection(
        requireId(connectionId, 'connection', action)
      ),
      { calendarResource: 'connections', group: 'calendar', json }
    );
    return;
  }

  throw new Error(`Unknown calendar connections action: ${action}`);
}

export async function handleSources(
  input: CalendarCommandInput,
  action: string
) {
  const { client, flags, json, workspaceId } = input;

  if (action === 'list') {
    render(await client.calendar.getDefaultSource(workspaceId), {
      calendarResource: 'sources',
      group: 'calendar',
      json,
    });
    return;
  }

  if (action === 'use' || action === 'update') {
    render(
      await client.calendar.updateDefaultSource(
        workspaceId,
        getSourcePayload(flags)
      ),
      { calendarResource: 'sources', group: 'calendar', json }
    );
    return;
  }

  throw new Error(`Unknown calendar sources action: ${action}`);
}

export async function handleSchedule(
  input: CalendarCommandInput,
  action: string
) {
  const { client, flags, json, workspaceId } = input;

  if (action === 'status') {
    render(await client.calendar.getScheduleStatus(workspaceId), {
      calendarResource: 'schedule',
      group: 'calendar',
      json,
    });
    return;
  }

  if (action === 'tasks') {
    render(
      await client.calendar.listSchedulableTasks(workspaceId, {
        q: pickString(flags, 'q'),
      }),
      { calendarResource: 'schedule-tasks', group: 'calendar', json }
    );
    return;
  }

  if (action === 'preview') {
    render(
      await client.calendar.previewSchedule<unknown>(
        workspaceId,
        getSchedulePayload(flags)
      ),
      { calendarResource: 'schedule-preview', group: 'calendar', json }
    );
    return;
  }

  if (action === 'apply') {
    render(
      await client.calendar.applySchedule<unknown>(
        workspaceId,
        getSchedulePayload(flags)
      ),
      { calendarResource: 'schedule-apply', group: 'calendar', json }
    );
    return;
  }

  throw new Error(`Unknown calendar schedule action: ${action}`);
}
