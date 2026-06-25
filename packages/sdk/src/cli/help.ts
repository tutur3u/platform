interface HelpTopic {
  commands?: string[];
  description?: string;
  examples?: string[];
  options?: string[];
  usage: string;
}

const helpTopics: Record<string, HelpTopic> = {
  box: {
    commands: [
      'run -- <command>             auto-lease a remote devbox and run a command',
      'build                       run a build command on a remote devbox',
      'serve                       build and serve an app from a remote devbox',
      'tunnel                      run a dockerized Cloudflare tunnel',
      'lease                        create a warm reusable devbox lease',
      'release <lease-id>           release a kept lease',
      'preview --lease <id> --port  expose an authenticated HTTP preview',
      'agent register               create a self-hosted runner token',
      'shutdown                     remove this runner from the cluster',
      'cache list|prune             inspect or prune runner cache metadata',
      'doctor                       inspect local runner prerequisites',
      'setup                        clone, install, start Supabase, and wire env',
      'repair                       repair an existing runner service without rotating its token',
      'upgrade                      upgrade the CLI on a remote runner',
    ],
    description:
      'Remote devboxes sync dirty code to containerized self-hosted runners for heavy Bun, Supabase, Docker, and e2e workflows.',
    examples: [
      'ttr box doctor',
      'ttr box setup',
      'ttr box setup --dir .',
      'ttr box setup --dir . --clone-into ./tuturuuu',
      'ttr box setup --agent --service --runner-name "$(hostname)-devbox" --yes',
      'ttr box repair --dir .',
      'ttr box repair --dir . --dry-run',
      'ttr box upgrade --runner <runner-id>',
      'TUTURUUU_DEVBOX_RUNNER_TOKEN=<token> ttr box shutdown',
      'ttr box run -- bun check',
      'ttr box run -- bun sb:reset',
      'ttr box build --cwd apps/web',
      'ttr box serve --cwd apps/web --port 7803 --database-url-env DEVBOX_DATABASE_URL',
      'ttr box serve --cloudflared --cloudflared-token-env CLOUDFLARED_TOKEN',
      'ttr box tunnel --cloudflared-token-env CLOUDFLARED_TOKEN',
      'ttr box run --keep --preview-port 7803 -- bun test:e2e',
      'ttr box preview --lease <lease-id> --port 7803',
    ],
    options: [
      '--runner <id>                prefer a specific runner',
      '--lease <id>                 reuse an existing kept lease',
      '--reuse                      reuse a compatible warm lease when possible',
      '--keep                       keep the lease warm after the command exits',
      '--timeout <duration>         command timeout; build/serve/tunnel default to none',
      '--wait                       wait for serve or tunnel runs to exit',
      '--preview-port <port>        request preview forwarding for a port',
      '--env KEY=value              set one-off remote env values',
      '--env-file <path>            explicitly send a remote env file',
      '--cwd <path>                 app/package directory for build or serve',
      '--build-command <cmd>        custom shell build command',
      '--serve-command <cmd>        custom shell serve command',
      '--port <port>                serve port, defaults to 7803',
      '--database-url <url>         set DATABASE_URL for the remote run',
      '--database-url-env <env>     read DATABASE_URL from a local env var',
      '--cloudflared                start a dockerized Cloudflare tunnel with serve',
      '--cloudflared-token-env <env> read a local tunnel token env var',
      '--cloudflared-image <image>  Cloudflare tunnel Docker image',
      '--dir <path>                 setup checkout path, defaults to the current platform checkout',
      '--clone-into <path>          clone into this path when setup target is not a platform checkout',
      '--agent                      register this machine as a runner during setup',
      '--service                    install a boot-starting runner service during setup',
      '--runner-name <name>         runner name for setup registration',
      '--service-manager <manager>  auto, systemd, or launchd',
      '--service-user <user>        OS user for the installed runner service',
      '--token-file <path>          path for the runner token env file',
      '--dry-run                    inspect repair inputs without writing service files',
      '--no-restart                 repair service files without restarting the service',
      '--token <token>              runner token for agent start or shutdown',
      '--yes                       install detected missing prerequisites during setup',
      '--json                       print machine-readable JSON',
    ],
    usage:
      'ttr box <run|build|serve|tunnel|lease|release|preview|agent|shutdown|cache|doctor|setup|repair|upgrade>',
  },
  boards: {
    commands: [
      'list                         list boards in the current workspace',
      'use [id]                     select a board',
      'create [name]                create a board',
      'update [id] --json-payload   update board fields',
      'delete [id]                  delete a board',
    ],
    description:
      'Boards are resolved in the selected workspace. List shows active boards by default. Omit an id in a TTY to pick with the keyboard.',
    examples: [
      'ttr boards',
      'ttr boards --archived',
      'ttr boards use',
      'ttr boards create "Roadmap"',
    ],
    options: [
      '--archived                  list archived boards',
      '--all, --include-archived    list active, archived, and deleted boards',
      '--deleted, --recently-deleted list deleted boards',
      '--q <query>                  filter boards by name',
      '--page <n>                   page number',
      '--page-size <n>              boards per page',
      '--workspace, --ws <id>        override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr boards [list|use|create|update|delete] [id] [options]',
  },
  calendar: {
    commands: [
      'events [list|get|create|update|delete]',
      'schedule [status|tasks|preview|apply]',
      'sources [list|use]',
      'calendars [list|create|update|delete|reset]',
      'categories [list|create|update|delete|reorder]',
      'accounts [list|disconnect]',
      'auth [google|microsoft]',
      'provider-calendars [list]',
      'connections [list|create|update|delete]',
    ],
    description:
      'Calendar commands use the selected workspace and the same authenticated calendar APIs as the web app.',
    examples: [
      'ttr calendar events list --start 2026-06-11T00:00:00Z --end 2026-06-12T00:00:00Z',
      'ttr calendar events create "Focus block" --start 2026-06-11T09:00:00+07:00 --duration-minutes 90',
      'ttr calendar schedule preview --window-days 14 --timezone Asia/Ho_Chi_Minh',
      'ttr calendar sources use --source-provider tuturuuu --calendar <calendar-id>',
      'ttr calendar auth google',
      'ttr calendar connections create --calendar-id primary --calendar-name "Primary" --account <account-id>',
    ],
    options: [
      '--workspace, --ws <id>        override the selected workspace',
      '--json-payload <json>         send explicit create/update payload fields',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr calendar <resource> [action] [id] [options]',
  },
  config: {
    commands: [
      'set-base-url <url>           target a local or staging web origin',
    ],
    examples: [
      'ttr config set-base-url http://localhost:7803',
      'ttr host use local --port 7803',
    ],
    usage: 'ttr config set-base-url <url>',
  },
  finance: {
    commands: [
      'wallets [list|get|balance|create|update|delete]',
      'checkpoints [list|get|create|update|delete|summary|batch]',
      'transactions [list|get|create|update|delete|export|stats]',
      'transfers [create|update|migrate]',
      'categories [list|get|create|update|delete]',
      'tags [list|get|create|update|delete]',
      'budgets [list|status|create|update|delete]',
      'recurring [list|upcoming|create|update|delete]',
    ],
    description:
      'Finance commands use the selected workspace and the same authenticated internal APIs as the web app.',
    examples: [
      'ttr finance wallets',
      'ttr finance wallets balance --all',
      'ttr finance checkpoints summary',
      'ttr finance checkpoints create --wallet <wallet-id> --actual-balance 150000 --checked-at 2026-06-11',
      'ttr finance checkpoints batch --checked-at 2026-06-11 --balances <wallet-id>=150000,<wallet-id>=42000',
      'ttr finance transactions --page-size 10',
      'ttr finance transactions create --amount 150000 --wallet <wallet-id> --taken-at 2026-05-09',
      'ttr finance transfers migrate --from-transaction <tx-id> --to-transaction <tx-id> --from-wallet <wallet-id> --to-wallet <wallet-id> --amount 150000 --taken-at 2026-05-09',
      'ttr finance categories create "Travel" --expense --color blue',
      'ttr finance tags create "Tuturuuu" --color "#9ef0ff"',
      'ttr finance budgets status',
    ],
    options: [
      '--workspace, --ws <id>        override the selected workspace',
      '--page <n>, --page-size <n>   paginate finance list output',
      '--json-payload <json>         send explicit create/update payload fields',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr finance <resource> [action] [id] [options]',
  },
  host: {
    commands: [
      'current                      show the active Tuturuuu origin',
      'list                         show built-in host targets',
      'use <production|prod|local|localhost|url>',
    ],
    description:
      'Switches the Tuturuuu CLI target origin. Changing origins clears the saved session and selected workspace context.',
    examples: [
      'ttr host current',
      'ttr host use production',
      'ttr host use local',
      'ttr host use local --port 7803',
      'ttr host use local --portless --port 1355',
      'ttr host use https://staging.example.com',
    ],
    options: [
      '--port <port>                use http://localhost:<port> for local targets',
      '--portless                   with --port, use https://tuturuuu.localhost:<port>',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr host [current|list|use] [target] [options]',
  },
  labels: {
    commands: [
      'list                         list labels',
      'use [id]                     select a label',
      'create                       create a label',
    ],
    examples: [
      'ttr labels',
      'ttr labels use',
      'ttr labels create --name Bug --color red',
      'ttr labels create --name Urgent --color "#DC2626"',
    ],
    options: [
      '--name <name>                label name for create',
      '--color <color>              label color name or hex code for create',
      '--workspace, --ws <id>        override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr labels [list|use|create] [options]',
  },
  lists: {
    commands: [
      'list                         list task lists for a board',
      'use [id]                     select a task list',
      'create [name]                create a task list',
      'update [id] --json-payload   update task list fields',
    ],
    description:
      'Task lists require a board. Use --board, a selected board, or the interactive board picker.',
    examples: [
      'ttr lists',
      'ttr lists use --board <board-id>',
      'ttr lists create "Done" --status done',
    ],
    options: [
      '--board <id>                 board id',
      '--name <name>                list name for create',
      '--status <status>            list status for create',
      '--color <color>              list color for create',
      '--workspace, --ws <id>        override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr lists [list|use|create|update] [id] [options]',
  },
  login: {
    description:
      'Creates a dedicated Tuturuuu CLI session. Use --copy when a browser callback is not available.',
    examples: [
      'ttr login',
      'ttr login --copy',
      'ttr login --token <cli-token> --base-url http://localhost:7803',
    ],
    options: [
      '--copy                       print a login URL and read the copied token from stdin',
      '--token <token>              exchange an existing short-lived CLI token',
      '--base-url <url>             login against another Tuturuuu origin',
    ],
    usage: 'ttr login [--copy] [--token <token>] [--base-url <url>]',
  },
  logout: {
    description: 'Clears the saved Tuturuuu CLI session and selected context.',
    examples: ['ttr logout'],
    usage: 'ttr logout',
  },
  upgrade: {
    description:
      'Upgrades the globally installed Tuturuuu CLI package with Bun.',
    examples: ['ttr upgrade'],
    usage: 'ttr upgrade',
  },
  projects: {
    commands: [
      'list                         list projects',
      'use [id]                     select a project',
      'create                       create a project',
      'get [id]                     show project details',
      'tasks [id]                   list project tasks',
    ],
    examples: [
      'ttr projects',
      'ttr projects create --name Launch',
      'ttr projects tasks',
    ],
    options: [
      '--name <name>                project name for create',
      '--description <text>         project description for create',
      '--workspace, --ws <id>        override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr projects [list|use|create|get|tasks] [id] [options]',
  },
  relationships: {
    commands: [
      'list [task-id]               list task relationships',
      'create [task-id]             create a relationship from JSON payload',
      'delete [task-id]             delete a relationship from JSON payload',
    ],
    examples: [
      'ttr relationships <task-id>',
      'ttr relationships create <task-id> --json-payload \'{"target_task_id":"...","type":"blocks"}\'',
    ],
    options: [
      '--task <id>                  task id when omitted positionally',
      '--json-payload <json>        relationship mutation payload',
      '--workspace, --ws <id>        override the selected workspace',
      '--json                       print machine-readable JSON',
    ],
    usage: 'ttr relationships [list|create|delete] [task-id] [options]',
  },
  tasks: {
    commands: [
      'list                         list open tasks plus assigned external tasks in personal workspace',
      'use [id]                     select a task',
      'get [id]                     show task details',
      'create [name]                create a task',
      'update [id] --json-payload   update task fields',
      'description [action] [id]    read or edit a task description',
      'done [id]                    mark a task as done',
      'close [id]                   mark a task as closed',
      'delete [id]                  delete a task',
      'move [id]                    move a task to another list or board',
      'bulk --ids <ids>             run a bulk task operation',
    ],
    description:
      'Task lists are sorted by priority and due date. Unscoped lists start from the personal workspace and include assigned tasks from other accessible workspaces. Human-readable lists show total tasks and page/max page. Use task UUIDs or board identifiers like VHP-12 for task CRUD. Omit ids in a TTY to choose with the keyboard.',
    examples: [
      'ttr tasks',
      'ttr tasks --compact',
      'ttr tasks --page 2 --page-size 50',
      'ttr tasks --include-review --include-done',
      'ttr tasks create "Add Tuturuuu CLI"',
      'ttr tasks description get VHP-12',
      'ttr tasks description set VHP-12 --file notes.md --format markdown',
      'ttr tasks done VHP-12',
      'ttr tasks close <task-id>',
      'ttr tasks update VHP-12 --json-payload \'{"completed":true}\'',
      'ttr tasks move <task-id> --list <done-list-id>',
    ],
    options: [
      '--all                        include all task-list statuses, task states, and archived boards',
      '--done, --completed          show completed tasks',
      '--closed                     show closed tasks',
      '--documents, --document      show document-list tasks',
      '--review                     show review-list tasks',
      '--include-archived           include tasks from archived boards',
      '--include-documents          include document-list tasks in default lists',
      '--include-review             include review-list tasks in default lists',
      '--include-done               include completed tasks in default lists',
      '--include-closed             include closed tasks in default lists',
      '--compact                    show title, task list, and per-task workspace only',
      '--board <id>                 filter by board or choose source board',
      '--list <id>                  filter by list or choose target list',
      '--page <n>, --page-size <n>   paginate list output',
      '--limit <n>, --offset <n>     paginate list output (offset form)',
      '--q <query>                  search task text',
      '--json                       print machine-readable JSON',
    ],
    usage:
      'ttr tasks [list|use|get|create|update|description|delete|move|bulk] [id] [options]',
  },
  tiptap: {
    commands: [
      'parse                        parse text, markdown, or TipTap JSON',
      'encode                       encode content as Yjs state',
      'decode                       decode Yjs state to TipTap JSON or text',
      'validate                     validate TipTap JSON or Yjs state',
    ],
    description:
      'Local task-description TipTap/Yjs codec utilities. These commands do not require login or read saved CLI config.',
    examples: [
      'ttr tiptap parse --text "Hello" --output json',
      'ttr tiptap parse --input notes.md --format markdown --output yjs-base64',
      'ttr tiptap encode --input description.json --format json --output bytes-json',
      'ttr tiptap decode --input state.txt --format yjs-base64 --output text',
      'ttr tiptap validate --input description.json --format json',
    ],
    options: [
      '--input <path|->             input file or stdin',
      '--file <path|->              alias for --input',
      '--text <text>                inline input',
      '--format <format>            text|markdown|json or yjs-base64|bytes-json for decode',
      '--output <format>            json|text|yjs-base64|bytes-json',
      '--json                       wrap output in a JSON envelope',
    ],
    usage: 'ttr tiptap [parse|encode|decode|validate] [options]',
  },
  whoami: {
    description:
      'Shows login state, account email, current workspace, selected ids, base URL, and config path.',
    examples: ['ttr whoami', 'ttr whoami --json'],
    options: ['--json                       print machine-readable JSON'],
    usage: 'ttr whoami [--json]',
  },
  workspaces: {
    commands: [
      'list                         list available workspaces',
      'use [id]                     select a workspace',
    ],
    description:
      'The personal workspace is selected by default. Omit an id to pick with the keyboard.',
    examples: [
      'ttr workspaces',
      'ttr workspaces use',
      'ttr workspaces use personal',
    ],
    options: ['--json                       print machine-readable JSON'],
    usage: 'ttr workspaces [list|use] [id] [options]',
  },
};

const actionHelpTopics: Record<string, Record<string, HelpTopic>> = {
  calendar: {
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
  },
  finance: {
    checkpoints: {
      examples: [
        'ttr finance checkpoints summary',
        'ttr finance checkpoints list --wallet <wallet-id> --limit 50',
        'ttr finance checkpoints get <checkpoint-id> --wallet <wallet-id>',
        'ttr finance checkpoints create --wallet <wallet-id> --actual-balance 150000 --checked-at 2026-06-11 --note "Monthly audit"',
        'ttr finance checkpoints update <checkpoint-id> --wallet <wallet-id> --actual-balance 151000',
        'ttr finance checkpoints batch --checked-at 2026-06-11 --balances <wallet-id>=150000,<wallet-id>=42000',
        'ttr finance checkpoints batch --entries-json \'[{"wallet_id":"...","actual_balance":150000}]\'',
      ],
      options: [
        '--wallet <id>              wallet id for list/get/create/update/delete',
        '--actual-balance <number>  actual wallet balance at checkpoint time',
        '--amount <number>          alias for --actual-balance',
        '--checked-at <date/time>   checkpoint date/time; local values use --timezone',
        '--timezone <iana>          timezone for date-only/local date-time inputs',
        '--note <text>              checkpoint note',
        '--balances <pairs>         batch wallet_id=amount pairs separated by commas',
        '--entries-json <json>      batch entries array with wallet_id and actual_balance',
        '--limit <n>                wallet checkpoint list limit',
        '--json-payload <json>      explicit payload override',
        '--json                     print machine-readable JSON',
      ],
      usage:
        'ttr finance checkpoints [list|get|create|update|delete|summary|batch] [id]',
    },
    budgets: {
      examples: [
        'ttr finance budgets',
        'ttr finance budgets status',
        'ttr finance budgets create "Marketing" --amount 1000000 --period monthly --start-date 2026-05-01',
        'ttr finance budgets update <budget-id> --json-payload \'{"amount":1200000}\'',
      ],
      options: [
        '--name <name>               budget name; positional text is also accepted',
        '--amount <number>           budget amount',
        '--period <monthly|yearly|custom>',
        '--start-date <iso>          budget start date',
        '--end-date <iso>            budget end date',
        '--wallet <id>               wallet id',
        '--category <id>             category id',
        '--alert-threshold <number>  alert threshold percentage',
        '--page <n>, --page-size <n> paginate list output',
        '--json-payload <json>       explicit payload override',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr finance budgets [list|status|create|update|delete] [id]',
    },
    categories: {
      examples: [
        'ttr finance categories',
        'ttr finance categories create "Revenue" --income --color green',
        'ttr finance categories update <category-id> --name Travel',
      ],
      options: [
        '--name <name>               category name; positional text is also accepted',
        '--description <text>        category description',
        '--expense                   mark as expense category',
        '--income                    mark as income category',
        '--icon <name>               icon name',
        '--color <color>             category color',
        '--page <n>, --page-size <n> paginate list output',
        '--json-payload <json>       explicit payload override',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr finance categories [list|get|create|update|delete] [id]',
    },
    tags: {
      examples: [
        'ttr finance tags',
        'ttr finance tags get <tag-id>',
        'ttr finance tags create "Tuturuuu" --color "#9ef0ff" --description "Platform costs"',
        'ttr finance tags update <tag-id> --description "Investment platform costs"',
      ],
      options: [
        '--name <name>               tag name; positional text is also accepted',
        '--description <text>        tag description',
        '--color <#rrggbb>           tag color',
        '--page <n>, --page-size <n> paginate list output',
        '--json-payload <json>       explicit payload override',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr finance tags [list|get|create|update|delete] [id]',
    },
    recurring: {
      examples: [
        'ttr finance recurring',
        'ttr finance recurring upcoming --days-ahead 30',
        'ttr finance recurring create "Rent" --amount 5000000 --wallet <wallet-id> --frequency monthly --start-date 2026-05-01',
      ],
      options: [
        '--name <name>               recurring transaction name',
        '--amount <number>           amount',
        '--wallet <id>               wallet id',
        '--category <id>             category id',
        '--frequency <daily|weekly|monthly|yearly>',
        '--start-date <iso>          start date',
        '--end-date <iso>            optional end date',
        '--days-ahead <number>       upcoming window',
        '--page <n>, --page-size <n> paginate list output',
        '--json-payload <json>       explicit payload override',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr finance recurring [list|upcoming|create|update|delete] [id]',
    },
    transactions: {
      examples: [
        'ttr finance transactions --page-size 10',
        'ttr finance transactions get <transaction-id>',
        'ttr finance transactions create --amount 150000 --wallet <wallet-id> --taken-at 2026-05-09',
        'ttr finance transactions update <transaction-id> --category <category-id>',
        'ttr finance transactions export --wallets <wallet-id> --start 2026-05-01 --end 2026-05-31',
      ],
      options: [
        '--amount <number>           transaction amount',
        '--wallet <id>               origin wallet id',
        '--category <id>             category id',
        '--taken-at <date/time>      transaction date/time; local values use --timezone',
        '--timezone <iana>           timezone for date-only/local date-time inputs',
        '--description <text>        transaction description',
        '--tags <ids>                comma-separated tag ids',
        '--page <n>, --page-size <n> paginate list/export output',
        '--limit <n>, --offset <n>   pagination aliases for scripts',
        '--start <iso>, --end <iso>  metric/export date range',
        '--type <income|expense>     export transaction type filter',
        '--json-payload <json>       explicit payload override',
        '--json                      print machine-readable JSON',
      ],
      usage:
        'ttr finance transactions [list|get|create|update|delete|export|stats|category-breakdown|spending-trends] [id]',
    },
    transfers: {
      examples: [
        'ttr finance transfers create --from-wallet <wallet-id> --to-wallet <wallet-id> --amount 150000 --taken-at 2026-05-09',
        'ttr finance transfers update --from-transaction <tx-id> --to-transaction <tx-id> --from-wallet <wallet-id> --to-wallet <wallet-id> --amount 150000 --taken-at 2026-05-09',
        'ttr finance transfers migrate --from-transaction <tx-id> --to-transaction <tx-id> --from-wallet <wallet-id> --to-wallet <wallet-id> --amount 150000 --taken-at 2026-05-09',
      ],
      options: [
        '--from-wallet <id>          origin wallet id',
        '--to-wallet <id>            destination wallet id',
        '--from-transaction <id>     origin transaction id for update/migrate',
        '--to-transaction <id>       destination transaction id for update/migrate',
        '--amount <number>           source amount; source transaction is stored negative',
        '--destination-amount <num>  destination amount for cross-currency transfers',
        '--taken-at <date/time>      transfer date/time; local values use --timezone',
        '--timezone <iana>           timezone for date-only/local date-time inputs',
        '--description <text>        transfer description',
        '--tags <ids>                comma-separated tag ids',
        '--report-opt-in <boolean>   include in reports',
        '--json-payload <json>       explicit payload override',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr finance transfers [create|update|migrate] [options]',
    },
    wallets: {
      examples: [
        'ttr finance wallets',
        'ttr finance wallets get <wallet-id>',
        'ttr finance wallets balance <wallet-id>',
        'ttr finance wallets balance --all',
        'ttr finance wallets create "Cash" --currency VND --balance 0 --type STANDARD',
        'ttr finance wallets update <wallet-id> --name "Operating Cash"',
      ],
      options: [
        '--name <name>               wallet name; positional text is also accepted',
        '--currency <code>           currency code',
        '--balance <number>          wallet balance',
        '--type <STANDARD|CREDIT>    wallet type',
        '--description <text>        wallet description',
        '--report-opt-in <boolean>   include in reports',
        '--limit <number>            credit limit',
        '--statement-date <number>   credit statement day',
        '--payment-date <number>     credit payment day',
        '--all                       show balance for all accessible wallets',
        '--page <n>, --page-size <n> paginate list output',
        '--json-payload <json>       explicit payload override',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr finance wallets [list|get|balance|create|update|delete] [id]',
    },
  },
  tasks: {
    bulk: {
      examples: [
        'ttr tasks bulk --ids id-1,id-2 --json-payload \'{"type":"archive"}\'',
      ],
      options: [
        '--ids <ids>                 comma-separated task ids',
        '--json-payload <json>       bulk operation payload',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr tasks bulk --ids <ids> --json-payload <json>',
    },
    create: {
      examples: [
        'ttr tasks create "Add Tuturuuu CLI"',
        'ttr tasks create --list <list-id> --name "Write release notes"',
        'ttr tasks create "Fix login" --priority critical --labels bug,cli',
        'ttr tasks create "Ship CLI docs" --description-file notes.md --description-format markdown',
      ],
      options: [
        '--name <name>               task title; positional text is also accepted',
        '--description <text>        task description text',
        '--description-file <path|-> task description file or stdin',
        '--description-format <fmt>  text, markdown, or json',
        '--list <id>                 destination list; omitted means selected list or picker',
        '--board <id>                board used when choosing a list',
        '--priority <priority>       task priority',
        '--start-date <iso>          start date',
        '--end-date <iso>            due date',
        '--labels <ids>              comma-separated label ids',
        '--projects <ids>            comma-separated project ids',
        '--assignees <ids>           comma-separated assignee ids',
      ],
      usage: 'ttr tasks create [name] [options]',
    },
    description: {
      description:
        'Reads or mutates a task description through the dedicated TipTap/Yjs description API.',
      examples: [
        'ttr tasks description get VHP-12',
        'ttr tasks description get VHP-12 --format yjs-base64',
        'ttr tasks description set VHP-12 --text "Follow up with QA"',
        'ttr tasks description set VHP-12 --file notes.md --format markdown',
        'ttr tasks description append VHP-12 --file - --format markdown',
        'ttr tasks description edit VHP-12',
        'ttr tasks description clear VHP-12',
      ],
      options: [
        '--task <id>                 task id when omitted positionally',
        '--text <text>               description input',
        '--file <path|->             description input file or stdin',
        '--description <text>        alias for --text',
        '--description-file <path|-> alias for --file',
        '--format <format>           input: text|markdown|json; get output: text|json|yjs-base64|raw',
        '--json                      print machine-readable JSON',
      ],
      usage:
        'ttr tasks description [get|set|append|prepend|edit|clear] [task-id] [options]',
    },
    close: {
      description:
        'Marks a task closed with closed_at. When no --list is provided, the CLI uses the first closed list on the task board when available.',
      examples: [
        'ttr tasks close',
        'ttr tasks close VHP-12',
        'ttr tasks close <task-id> --list <closed-list-id>',
      ],
      options: [
        '--list <id>, --list-id <id> closed destination list override',
        '--board <id>                board used when finding the default closed list',
        '--json-payload <json>       optional extra task update fields',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr tasks close [task-id] [options]',
    },
    done: {
      description:
        'Marks a task done with completed_at. When no --list is provided, the CLI uses the first done list on the task board when available.',
      examples: [
        'ttr tasks done',
        'ttr tasks done VHP-12',
        'ttr tasks done <task-id> --list <done-list-id>',
      ],
      options: [
        '--list <id>, --list-id <id> done destination list override',
        '--board <id>                board used when finding the default done list',
        '--json-payload <json>       optional extra task update fields',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr tasks done [task-id] [options]',
    },
    list: {
      examples: [
        'ttr tasks',
        'ttr tasks --compact',
        'ttr tasks --board <board-id> --limit 20',
        'ttr tasks --json --no-update-check',
      ],
      options: helpTopics.tasks?.options ?? [],
      usage: 'ttr tasks [list] [options]',
    },
    move: {
      examples: [
        'ttr tasks move',
        'ttr tasks move VHP-12 --list <list-id>',
        'ttr tasks move <task-id> --target-board <board-id> --list <list-id>',
      ],
      options: [
        '--list <id>                 target list; omitted means picker',
        '--target-board <id>         target board when moving across boards',
        '--board <id>                source board or fallback target board',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr tasks move [task-id] [options]',
    },
    update: {
      examples: [
        'ttr tasks update',
        'ttr tasks update VHP-12 --json-payload \'{"name":"New title"}\'',
        'ttr tasks update VHP-12 --description "Clarified acceptance criteria"',
        'ttr tasks update VHP-12 --description-file notes.md --description-format markdown',
        'ttr tasks update <task-id> --json-payload \'{"completed":true}\'',
        'ttr tasks update <task-id> --list <done-list-id> --json-payload \'{"completed":true}\'',
      ],
      options: [
        '--json-payload <json>       task update payload',
        '--description <text>        update task description text',
        '--description-file <path|-> update task description file or stdin',
        '--description-format <fmt>  text, markdown, or json',
        '--list <id>, --list-id <id> also set list_id in the update payload',
        '--json                      print machine-readable JSON',
      ],
      usage: 'ttr tasks update [task-id] --json-payload <json> [options]',
    },
  },
};

function formatHelp(topic: HelpTopic, heading: string) {
  return [
    heading,
    '',
    topic.description,
    '',
    `Usage: ${topic.usage}`,
    topic.commands?.length
      ? ['', 'Commands:', ...topic.commands.map((line) => `  ${line}`)]
      : [],
    topic.options?.length
      ? ['', 'Options:', ...topic.options.map((line) => `  ${line}`)]
      : [],
    topic.examples?.length
      ? ['', 'Examples:', ...topic.examples.map((line) => `  ${line}`)]
      : [],
  ]
    .flat()
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n');
}

export function getGlobalHelp() {
  return `${[
    'Tuturuuu CLI',
    '',
    'Usage: ttr <command> [options]',
    '',
    'Commands:',
    '  login [--copy] [--token <token>] [--base-url <url>]',
    '  logout',
    '  upgrade',
    '  whoami',
    '  host [current|list|use]',
    '  config set-base-url <url>',
    '  box <run|lease|release|preview|agent|shutdown|cache|doctor|setup|repair>',
    '  calendar <events|schedule|sources|calendars|categories|accounts|auth|provider-calendars|connections>',
    '  finance <wallets|checkpoints|transactions|transfers|categories|tags|budgets|recurring>',
    '  workspaces [list]|use [id]',
    '  boards [list]|use|create|update|delete',
    '  lists [list]|use|create|update --board <id>',
    '  tasks [list]|use|get|create|update|done|close|delete|move|bulk',
    '  tiptap [parse|encode|decode|validate]',
    '  labels [list]|use|create',
    '  projects [list]|use|create|get|tasks',
    '  relationships [list]|create|delete <task-id>',
    '',
    'Selection:',
    '  Omit an id on use/get/update/delete/move to pick with up/down/space/enter.',
    '  The personal workspace is selected by default.',
    '',
    'Task list filters:',
    '  tasks                       open personal tasks plus assigned external tasks',
    '  tasks --all                 include done and closed tasks',
    '  tasks --done                completed tasks',
    '  tasks --closed              closed tasks',
    '  tasks --page 2 --page-size 50',
    '  tasks --compact             title, list, and per-task workspace only',
    '',
    'Scoped help:',
    '  ttr finance --help',
    '  ttr calendar --help',
    '  ttr calendar events --help',
    '  ttr finance transactions --help',
    '  ttr host --help',
    '  ttr tasks --help',
    '  ttr tiptap --help',
    '  ttr box --help',
    '  ttr tasks create --help',
    '  ttr tasks description --help',
    '  ttr help workspaces',
    '',
    'Global options:',
    '  -h, --help                  print help',
    '  -v, --version               print the CLI version',
  ].join('\n')}\n`;
}

function normalizeHelpAction(group: string, action?: string) {
  if (group !== 'tasks') {
    return action;
  }

  if (['complete', 'completed', 'mark-done'].includes(action || '')) {
    return 'done';
  }

  if (['archive', 'closed', 'mark-closed'].includes(action || '')) {
    return 'close';
  }

  if (['desc', 'descriptions'].includes(action || '')) {
    return 'description';
  }

  return action;
}

function normalizeHelpGroup(group: string) {
  return group === 'devbox' ? 'box' : group;
}

export function getHelpOutput(group?: string, action?: string) {
  if (!group) {
    return getGlobalHelp();
  }

  const normalizedGroup = normalizeHelpGroup(group);
  const normalizedAction = normalizeHelpAction(normalizedGroup, action);
  const actionTopic =
    actionHelpTopics[normalizedGroup]?.[normalizedAction || ''];
  if (actionTopic) {
    return `${formatHelp(
      actionTopic,
      `ttr ${normalizedGroup} ${normalizedAction}`
    )}\n`;
  }

  const topic = helpTopics[normalizedGroup];
  if (topic) {
    return `${formatHelp(topic, `ttr ${normalizedGroup}`)}\n`;
  }

  return `${getGlobalHelp()}Unknown help topic: ${group}\n`;
}
