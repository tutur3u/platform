import type { TuturuuuUserClient } from '../platform';
import type { FlagValue } from './args';
import { runCalendarCommand } from './calendar';
import { runFeedbackCommand } from './feedback';

export async function runCalendarFeedbackDispatch(
  input: {
    client: TuturuuuUserClient;
    flags: Record<string, FlagValue>;
    json: boolean;
    positionals: string[];
  },
  resolveWorkspaceId: () => string
) {
  if (input.positionals[0] === 'feedback') {
    await runFeedbackCommand(input);
    return true;
  }
  if (input.positionals[0] === 'calendar') {
    await runCalendarCommand({
      client: input.client,
      flags: input.flags,
      json: input.json,
      positionals: input.positionals,
      workspaceId: resolveWorkspaceId(),
    });
    return true;
  }
  return false;
}
