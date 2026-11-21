const taskFleetWriteOptions = [
  '--agent-owners <keys>        ordered, comma-separated agent keys',
  '--needs-user <true|false>    set whether the task needs user attention',
  '--needs-user-reason <text>   explanation, or an empty string to clear',
  '--links-json <json>          array of links with url and optional title',
  '--blocked-by <ids>          add incoming blockers by task UUID',
];

export const taskShowHelp = {
  examples: ['ttr tasks show VHP-12', 'ttr tasks show VHP-12 --json'],
  options: ['--json                      print machine-readable JSON'],
  usage: 'ttr tasks show [task-id] [options]',
};

export const taskCreateHelp = {
  examples: [
    'ttr tasks create "Add Tuturuuu CLI"',
    'ttr tasks create --list <list-id> --name "Write release notes"',
    'ttr tasks create --template bug-report --list <list-id>',
    'ttr tasks create "Fix login" --priority critical --labels bug,cli',
    'ttr tasks create "Ship CLI docs" --description-file notes.md --description-format markdown',
    'ttr tasks create "QA handoff" --description-file table.md --description-format markdown',
  ],
  options: [
    '--name <name>               task title; positional text is also accepted',
    '--template <key-or-path>     create from a workspace or local task template',
    '--description <text>        task description text',
    '--description-file <path|-> task description file or stdin',
    '--description-format <fmt>  text, markdown, or json; markdown supports pipe tables',
    '--list <id>                 destination list; omitted means selected list or picker',
    '--board <id>                board used when choosing a list',
    '--priority <priority>       task priority',
    '--start-date <iso>          start date',
    '--end-date <iso>            due date',
    '--labels <ids>              comma-separated label ids',
    '--projects <ids>            comma-separated project ids',
    '--assignees <ids>           comma-separated assignee ids',
    ...taskFleetWriteOptions,
    '--json                      print machine-readable JSON',
  ],
  usage: 'ttr tasks create [name] [options]',
};

export const taskUpdateHelp = {
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
    '--description-format <fmt>  text, markdown, or json; markdown supports pipe tables',
    '--list <id>, --list-id <id> also set list_id in the update payload',
    ...taskFleetWriteOptions,
    '--remove-blocked-by <ids>   remove incoming blockers by task UUID',
    '--json                      print machine-readable JSON',
  ],
  usage: 'ttr tasks update [task-id] [options]',
};
