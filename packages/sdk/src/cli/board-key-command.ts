import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import { escapeTerminalText } from './select';

export async function runBoardKeyCliCommand({
  client,
  firstId: boardId,
  flags,
  json,
  positionals,
  workspaceId,
}: {
  client: TuturuuuUserClient;
  firstId?: string;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
}) {
  if (!boardId || positionals.length !== 3) {
    throw new Error('Usage: ttr boards key <board-id> [--set <key>]');
  }

  const requestedKey = getFlag(flags, 'set')?.trim().toUpperCase();
  if (Object.hasOwn(flags, 'set')) {
    if (!requestedKey) {
      throw new Error('--set requires a non-empty board key.');
    }
    await client.tasks.updateBoard(workspaceId, boardId, {
      ticket_prefix: requestedKey,
    });
  }

  const { board } = await client.tasks
    .getBoard(workspaceId, boardId)
    .catch((cause: unknown) => {
      if (!requestedKey) throw cause;
      throw new Error(
        'The board key update returned success, but verification failed. Run ttr boards key again to check the current value.',
        { cause }
      );
    });
  if (requestedKey && requestedKey !== board.ticket_prefix) {
    throw new Error(
      'Could not verify the board key after updating it. Run ttr boards key again to check the current value.'
    );
  }

  const result = { board_id: board.id, ticket_prefix: board.ticket_prefix };
  process.stdout.write(
    json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${escapeTerminalText(board.ticket_prefix ?? '') || 'No board key'}\n`
  );
  return true;
}
