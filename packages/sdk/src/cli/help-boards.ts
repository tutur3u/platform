import type { HelpTopic } from './help-format';

export const boardsHelp: HelpTopic = {
  commands: [
    'list                         list boards in the current workspace',
    'use [id]                     select a board',
    'key <id> [--set <key>]       show or set the board key',
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
    'ttr boards key <board-id> --set F',
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
  usage: 'ttr boards [list|use|key|create|update|delete] [id] [options]',
};
