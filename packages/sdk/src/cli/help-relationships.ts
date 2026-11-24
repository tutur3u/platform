import type { HelpTopic } from './help-format';

export const relationshipsHelp: HelpTopic = {
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
};
