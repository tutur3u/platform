import {
  handleCalendars,
  handleCategories,
  handleEvents,
} from './calendar-admin';
import {
  handleAccounts,
  handleAuth,
  handleConnections,
  handleProviderCalendars,
  handleSchedule,
  handleSources,
} from './calendar-integrations';
import {
  type CalendarCommandInput,
  defaultAction,
  normalizeResource,
} from './calendar-payloads';

export async function runCalendarCommand(input: CalendarCommandInput) {
  const resource = normalizeResource(input.positionals[1]);
  if (!resource) {
    throw new Error(
      'Missing calendar resource. Use events, schedule, sources, calendars, categories, accounts, auth, provider-calendars, or connections.'
    );
  }

  const action = input.positionals[2] || defaultAction(resource);
  if (!action) {
    return handleAuth(input, input.positionals[2]);
  }

  switch (resource) {
    case 'accounts':
      return handleAccounts(input, action);
    case 'auth':
      return handleAuth(input, action);
    case 'calendars':
      return handleCalendars(input, action);
    case 'categories':
      return handleCategories(input, action);
    case 'connections':
      return handleConnections(input, action);
    case 'events':
      return handleEvents(input, action);
    case 'provider-calendars':
      return handleProviderCalendars(input, action);
    case 'schedule':
      return handleSchedule(input, action);
    case 'sources':
      return handleSources(input, action);
    default:
      throw new Error(`Unknown calendar resource: ${resource}`);
  }
}
