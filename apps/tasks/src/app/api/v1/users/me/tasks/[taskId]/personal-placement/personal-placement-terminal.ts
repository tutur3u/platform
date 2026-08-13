export type PersonalPlacementTerminalStatus = 'done' | 'closed';

export function getTerminalDefaultColumn(
  status: PersonalPlacementTerminalStatus
) {
  return status === 'done' ? 'default_done_list_id' : 'default_closed_list_id';
}

export function isTerminalDefaultColumnUnavailable(
  error: { code?: string; message?: string } | null | undefined,
  status: PersonalPlacementTerminalStatus
) {
  if (!error) return false;
  const column = getTerminalDefaultColumn(status);
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (typeof error.message === 'string' && error.message.includes(column))
  );
}

export function shouldMoveSourceTaskToTerminalList(
  sourceStatus: string | null | undefined,
  terminalStatus: PersonalPlacementTerminalStatus
) {
  return sourceStatus !== terminalStatus;
}
