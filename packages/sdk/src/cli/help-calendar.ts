import type { HelpTopic } from './help-format';

/** Per-action help for `ttr calendar <action>`. */
export const calendarActionHelp: Record<string, HelpTopic> = {
  accounts: {
    examples: [
      'ttr calendar accounts',
      'ttr calendar accounts disconnect <account-id>',
    ],
    options: [
      '--workspace, --ws <id>       override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr calendar accounts [list|disconnect] [account-id]',
  },
  auth: {
    examples: ['ttr calendar auth google', 'ttr calendar auth microsoft'],
    options: [
      '--workspace, --ws <id>       override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr calendar auth <google|microsoft>',
  },
  calendars: {
    examples: [
      'ttr calendar calendars',
      'ttr calendar calendars create "Team" --color BLUE',
      'ttr calendar calendars update <calendar-id> --name "Team Calendar"',
      'ttr calendar calendars delete <calendar-id>',
      'ttr calendar calendars reset --yes',
    ],
    options: [
      '--name <name>                calendar name; positional text is also accepted for create',
      '--description <text>         calendar description',
      '--color <color>              calendar color',
      '--enabled <boolean>          enable or disable the calendar',
      '--position <number>          display position',
      '--yes                        required for destructive reset',
      '--json-payload <json>        explicit payload override',
      '--json                       print machine-readable JSON',
    ],
    usage:
      'ttr calendar calendars [list|create|update|delete|reset] [calendar-id]',
  },
  categories: {
    examples: [
      'ttr calendar categories',
      'ttr calendar categories create "Focus" --color BLUE',
      'ttr calendar categories update <category-id> --name "Deep Focus"',
      'ttr calendar categories reorder --json-payload \'{"categories":[{"id":"...","position":0}]}\'',
    ],
    options: [
      '--name <name>                category name; positional text is also accepted for create',
      '--color <color>              category color',
      '--json-payload <json>        explicit payload override; required for reorder',
      '--json                       print machine-readable JSON',
    ],
    usage:
      'ttr calendar categories [list|create|update|delete|reorder] [category-id]',
  },
  connections: {
    examples: [
      'ttr calendar connections',
      'ttr calendar connections create --calendar-id primary --calendar-name "Primary" --account <account-id>',
      'ttr calendar connections update <connection-id> --enabled false',
      'ttr calendar connections delete <connection-id>',
    ],
    options: [
      '--calendar-id <id>           provider calendar id',
      '--calendar-name <name>       provider calendar display name',
      '--account, --account-id <id> connected provider account id',
      '--color <color>              connection color',
      '--enabled <boolean>          enable or disable the connection',
      '--access-role <role>         provider access role',
      '--json-payload <json>        explicit payload override',
      '--json                       print machine-readable JSON',
    ],
    usage:
      'ttr calendar connections [list|create|update|delete] [connection-id]',
  },
  events: {
    examples: [
      'ttr calendar events list --start 2026-06-11T00:00:00Z --end 2026-06-12T00:00:00Z',
      'ttr calendar events get <event-id>',
      'ttr calendar events create "Focus block" --start 2026-06-11T09:00:00+07:00 --duration-minutes 90',
      'ttr calendar events update <event-id> --title "Focus block" --locked true',
      'ttr calendar events delete <event-id>',
    ],
    options: [
      '--start, --start-at <iso>    event/list start date-time',
      '--end, --end-at <iso>        event/list end date-time',
      '--duration-minutes <n>       create/update end time from start plus minutes',
      '--title <title>              event title; positional text is also accepted for create',
      '--description <text>         event description',
      '--location <text>            event location',
      '--color <color>              event color',
      '--locked <boolean>           lock or unlock event',
      '--task, --task-id <id>       linked task id',
      '--source-provider <provider> tuturuuu, google, or microsoft',
      '--calendar <id>              workspace calendar id for Tuturuuu source',
      '--connection <id>            provider connection id for Google/Microsoft source',
      '--json-payload <json>        explicit payload override',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr calendar events [list|get|create|update|delete] [event-id]',
  },
  'provider-calendars': {
    examples: [
      'ttr calendar provider-calendars',
      'ttr calendar provider-calendars list --account <account-id>',
    ],
    options: [
      '--account, --account-id <id> filter by connected provider account',
      '--workspace, --ws <id>       override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr calendar provider-calendars [list]',
  },
  schedule: {
    examples: [
      'ttr calendar schedule status',
      'ttr calendar schedule tasks --q roadmap',
      'ttr calendar schedule preview --window-days 14 --timezone Asia/Ho_Chi_Minh',
      'ttr calendar schedule apply --mode safe-apply --scope impacted-only --window-days 14 --timezone Asia/Ho_Chi_Minh',
    ],
    options: [
      '--window-days <7-90>         schedule window',
      '--timezone <iana>            client timezone when workspace timezone is auto',
      '--mode <safe-apply|full-apply>',
      '--scope <impacted-only|full-window>',
      '--q <query>                  filter schedulable tasks',
      '--json-payload <json>        explicit preview/apply payload override',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr calendar schedule [status|tasks|preview|apply]',
  },
  sources: {
    examples: [
      'ttr calendar sources',
      'ttr calendar sources use --source-provider tuturuuu --calendar <calendar-id>',
      'ttr calendar sources use --source-provider google --connection <connection-id>',
    ],
    options: [
      '--source-provider <provider> tuturuuu, google, or microsoft',
      '--calendar <id>              workspace calendar id for Tuturuuu source',
      '--connection <id>            provider connection id for Google/Microsoft source',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr calendar sources [list|use]',
  },
};
