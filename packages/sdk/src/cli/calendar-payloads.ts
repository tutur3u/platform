import type { TuturuuuUserClient } from '../platform';
import type {
  CalendarCategoryPayload,
  CalendarConnectionPayload,
  CalendarConnectionUpdatePayload,
  CalendarSourceInput,
  ScheduleApplyRequestPayload,
  SchedulePreviewRequestPayload,
  WorkspaceCalendarEventCreatePayload,
  WorkspaceCalendarEventUpdatePayload,
  WorkspaceCalendarPayload,
  WorkspaceCalendarUpdatePayload,
} from '../platform-calendar';
import { type FlagValue, getFlag } from './args';

export interface CalendarCommandInput {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
}

export type CalendarResource =
  | 'accounts'
  | 'auth'
  | 'calendars'
  | 'categories'
  | 'connections'
  | 'events'
  | 'provider-calendars'
  | 'schedule'
  | 'sources';

const CALENDAR_RESOURCES = new Set<CalendarResource>([
  'accounts',
  'auth',
  'calendars',
  'categories',
  'connections',
  'events',
  'provider-calendars',
  'schedule',
  'sources',
]);

export function normalizeResource(
  value?: string
): CalendarResource | undefined {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'source') return 'sources';
  if (normalized === 'calendar') return 'calendars';
  if (normalized === 'category') return 'categories';
  if (normalized === 'connection') return 'connections';
  if (normalized === 'account') return 'accounts';
  if (normalized === 'provider-calendar') return 'provider-calendars';
  return CALENDAR_RESOURCES.has(normalized as CalendarResource)
    ? (normalized as CalendarResource)
    : undefined;
}

export function defaultAction(resource: CalendarResource) {
  switch (resource) {
    case 'auth':
      return undefined;
    case 'schedule':
      return 'status';
    default:
      return 'list';
  }
}

export function parseJsonPayload(flags: Record<string, FlagValue>) {
  const payload = getFlag(flags, 'json-payload');
  return payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
}

export function pickString(
  flags: Record<string, FlagValue>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = getFlag(flags, key);
    if (value !== undefined) return value;
  }
}

function parseBoolean(value: FlagValue | undefined) {
  if (value === true) return true;
  if (typeof value !== 'string') return undefined;

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
      return true;
    case '0':
    case 'false':
    case 'no':
      return false;
    default:
      return undefined;
  }
}

function parseNumber(value?: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveInteger(value?: string) {
  const parsed = parseNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function assignDefined<T extends Record<string, unknown>>(
  payload: T,
  key: keyof T,
  value: unknown
) {
  if (value !== undefined) {
    payload[key] = value as T[keyof T];
  }
}

function mergePayload<T extends Record<string, unknown>>(
  payload: T,
  flags: Record<string, FlagValue>
) {
  return {
    ...payload,
    ...parseJsonPayload(flags),
  } as T;
}

export function requireId(
  id: string | undefined,
  resource: string,
  action: string
) {
  if (!id) {
    throw new Error(`Missing ${resource} id for calendar ${action}.`);
  }

  return id;
}

export function parseIsoDateTime(value: string | undefined, flag: string) {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid ${flag}. Use an ISO date-time value.`);
  }

  return new Date(timestamp).toISOString();
}

function getEventTimePayload(
  flags: Record<string, FlagValue>,
  options: { create?: boolean } = {}
) {
  const startInput = pickString(flags, 'start', 'start-at');
  const endInput = pickString(flags, 'end', 'end-at');
  const durationInput = pickString(flags, 'duration-minutes', 'duration');
  const durationMinutes = parsePositiveInteger(durationInput);

  if (options.create && !startInput) {
    throw new Error('Calendar event create requires --start.');
  }

  if (durationInput !== undefined && durationMinutes === undefined) {
    throw new Error('--duration-minutes must be a positive integer.');
  }

  if (endInput && durationMinutes !== undefined) {
    throw new Error('Use either --end or --duration-minutes, not both.');
  }

  if (durationMinutes !== undefined && !startInput) {
    throw new Error('--duration-minutes requires --start.');
  }

  if (options.create && !endInput && durationMinutes === undefined) {
    throw new Error(
      'Calendar event create requires --end or --duration-minutes.'
    );
  }

  const start = parseIsoDateTime(startInput, '--start');
  const end = endInput
    ? parseIsoDateTime(endInput, '--end')
    : start && durationMinutes !== undefined
      ? new Date(Date.parse(start) + durationMinutes * 60_000).toISOString()
      : undefined;

  if (start && end && Date.parse(end) <= Date.parse(start)) {
    throw new Error('Calendar event end must be after start.');
  }

  return {
    end_at: end,
    start_at: start,
  };
}

function getCalendarSource(flags: Record<string, FlagValue>) {
  const provider = pickString(flags, 'source-provider', 'provider');
  if (!provider) return undefined;

  if (provider === 'tuturuuu') {
    return {
      provider,
      workspaceCalendarId:
        pickString(flags, 'calendar', 'workspace-calendar') ?? null,
    } satisfies CalendarSourceInput;
  }

  if (provider === 'google' || provider === 'microsoft') {
    const connectionId = pickString(flags, 'connection', 'connection-id');
    if (!connectionId) {
      throw new Error(
        `Calendar ${provider} source requires --connection <id>.`
      );
    }

    return {
      provider,
      connectionId,
    } satisfies CalendarSourceInput;
  }

  throw new Error(
    'Unsupported calendar source provider. Use tuturuuu, google, or microsoft.'
  );
}

export function getEventPayload(
  flags: Record<string, FlagValue>,
  positionals: string[],
  options: { create?: boolean } = {}
) {
  const payload: Record<string, unknown> = {};
  const positionalTitle = options.create
    ? positionals.slice(3).join(' ').trim()
    : undefined;

  assignDefined(
    payload,
    'title',
    pickString(flags, 'title') || positionalTitle
  );
  assignDefined(payload, 'description', pickString(flags, 'description'));
  assignDefined(payload, 'location', pickString(flags, 'location'));
  assignDefined(payload, 'color', pickString(flags, 'color'));
  assignDefined(payload, 'locked', parseBoolean(flags.locked));
  assignDefined(payload, 'task_id', pickString(flags, 'task', 'task-id'));
  assignDefined(payload, 'source', getCalendarSource(flags));

  const timePayload = getEventTimePayload(flags, options);
  assignDefined(payload, 'start_at', timePayload.start_at);
  assignDefined(payload, 'end_at', timePayload.end_at);

  if (options.create && !payload.title) {
    throw new Error('Calendar event create requires a title or --title.');
  }

  return mergePayload(
    payload,
    flags
  ) as unknown as WorkspaceCalendarEventCreatePayload &
    WorkspaceCalendarEventUpdatePayload;
}

export function getCalendarPayload(
  flags: Record<string, FlagValue>,
  positionals: string[],
  options: { id?: string; create?: boolean } = {}
) {
  const payload: Record<string, unknown> = {};
  const positionalName = options.create
    ? positionals.slice(3).join(' ').trim()
    : undefined;

  assignDefined(payload, 'id', options.id);
  assignDefined(payload, 'name', pickString(flags, 'name') || positionalName);
  assignDefined(payload, 'description', pickString(flags, 'description'));
  assignDefined(payload, 'color', pickString(flags, 'color'));
  assignDefined(payload, 'is_enabled', parseBoolean(flags.enabled));
  assignDefined(
    payload,
    'position',
    parseNumber(pickString(flags, 'position'))
  );

  if (options.create && !payload.name) {
    throw new Error('Calendar create requires a name or --name.');
  }

  return mergePayload(payload, flags) as unknown as WorkspaceCalendarPayload &
    WorkspaceCalendarUpdatePayload;
}

export function getCategoryPayload(
  flags: Record<string, FlagValue>,
  positionals: string[],
  options: { create?: boolean } = {}
) {
  const payload: Record<string, unknown> = {};
  const positionalName = options.create
    ? positionals.slice(3).join(' ').trim()
    : undefined;

  assignDefined(payload, 'name', pickString(flags, 'name') || positionalName);
  assignDefined(payload, 'color', pickString(flags, 'color'));

  if (options.create && !payload.name) {
    throw new Error('Calendar category create requires a name or --name.');
  }

  return mergePayload(payload, flags) as unknown as CalendarCategoryPayload;
}

export function getConnectionPayload(
  flags: Record<string, FlagValue>,
  options: { id?: string } = {}
) {
  const payload: Record<string, unknown> = {};

  assignDefined(payload, 'id', options.id);
  assignDefined(payload, 'calendarId', pickString(flags, 'calendar-id'));
  assignDefined(
    payload,
    'calendarName',
    pickString(flags, 'calendar-name', 'name')
  );
  assignDefined(payload, 'color', pickString(flags, 'color'));
  assignDefined(
    payload,
    'authTokenId',
    pickString(flags, 'account', 'account-id')
  );
  assignDefined(payload, 'accessRole', pickString(flags, 'access-role'));
  assignDefined(payload, 'isEnabled', parseBoolean(flags.enabled));

  return mergePayload(payload, flags) as unknown as CalendarConnectionPayload &
    CalendarConnectionUpdatePayload;
}

export function getSchedulePayload(flags: Record<string, FlagValue>) {
  const payload: Record<string, unknown> = {};
  assignDefined(
    payload,
    'windowDays',
    parsePositiveInteger(pickString(flags, 'window-days'))
  );
  assignDefined(payload, 'clientTimezone', pickString(flags, 'timezone'));
  assignDefined(payload, 'mode', pickString(flags, 'mode'));
  assignDefined(payload, 'scope', pickString(flags, 'scope'));
  return mergePayload(payload, flags) as SchedulePreviewRequestPayload &
    ScheduleApplyRequestPayload;
}

export function getSourcePayload(flags: Record<string, FlagValue>) {
  const source = getCalendarSource(flags);
  if (!source) {
    throw new Error(
      'Calendar source update requires --source-provider and related source flags.'
    );
  }

  return source;
}
