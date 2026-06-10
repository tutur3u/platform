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
      'transactions [list|get|create|update|delete|export|stats]',
      'transfers [create|update|migrate]',
      'categories [list|get|create|update|delete]',
      'budgets [list|status|create|update|delete]',
      'recurring [list|upcoming|create|update|delete]',
    ],
    description:
      'Finance commands use the selected workspace and the same authenticated internal APIs as the web app.',
    examples: [
      'ttr finance wallets',
      'ttr finance wallets balance --all',
      'ttr finance transactions --page-size 10',
      'ttr finance transactions create --amount 150000 --wallet <wallet-id> --taken-at 2026-05-09',
      'ttr finance transfers migrate --from-transaction <tx-id> --to-transaction <tx-id> --from-wallet <wallet-id> --to-wallet <wallet-id> --amount 150000 --taken-at 2026-05-09',
      'ttr finance categories create "Travel" --expense --color blue',
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
      'ttr tasks [list|use|get|create|update|delete|move|bulk] [id] [options]',
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
  finance: {
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
        '--taken-at <iso>            transaction date/time',
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
        '--taken-at <iso>            transfer date/time',
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
      ],
      options: [
        '--name <name>               task title; positional text is also accepted',
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
        'ttr tasks update <task-id> --json-payload \'{"completed":true}\'',
        'ttr tasks update <task-id> --list <done-list-id> --json-payload \'{"completed":true}\'',
      ],
      options: [
        '--json-payload <json>       task update payload',
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
    '  finance <wallets|transactions|transfers|categories|budgets|recurring>',
    '  workspaces [list]|use [id]',
    '  boards [list]|use|create|update|delete',
    '  lists [list]|use|create|update --board <id>',
    '  tasks [list]|use|get|create|update|done|close|delete|move|bulk',
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
    '  ttr finance transactions --help',
    '  ttr host --help',
    '  ttr tasks --help',
    '  ttr box --help',
    '  ttr tasks create --help',
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
