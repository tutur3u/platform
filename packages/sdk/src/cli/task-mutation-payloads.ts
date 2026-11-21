import { type FlagValue, getFlag } from './args';
import { getTaskFleetFlags } from './task-fleet-fields';

export function getPayload(flags: Record<string, FlagValue>) {
  const payload = getFlag(flags, 'json-payload');
  return payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
}

export function getTaskUpdatePayload(flags: Record<string, FlagValue>) {
  const payload: Record<string, unknown> = {
    ...getPayload(flags),
    ...getTaskFleetFlags(flags),
  };
  const listId = getFlag(flags, 'list') || getFlag(flags, 'list-id');

  if (listId && payload.list_id === undefined) {
    payload.list_id = listId;
  }

  if (
    payload.completed === true &&
    payload.completed_at === undefined &&
    payload.closed_at === undefined
  ) {
    payload.completed_at = new Date().toISOString();
  }

  return payload;
}

export function getTaskDonePayload(
  flags: Record<string, FlagValue>,
  listId?: string
) {
  const payload = getPayload(flags);
  const explicitListId =
    listId || getFlag(flags, 'list') || getFlag(flags, 'list-id');

  payload.completed = true;

  if (payload.completed_at === undefined) {
    payload.completed_at = new Date().toISOString();
  }

  if (explicitListId && payload.list_id === undefined) {
    payload.list_id = explicitListId;
  }

  return payload;
}

export function getTaskClosePayload(
  flags: Record<string, FlagValue>,
  listId?: string
) {
  const payload = getPayload(flags);
  const explicitListId =
    listId || getFlag(flags, 'list') || getFlag(flags, 'list-id');

  payload.completed = false;

  if (payload.completed_at === undefined) {
    payload.completed_at = null;
  }

  if (payload.closed_at === undefined) {
    payload.closed_at = new Date().toISOString();
  }

  if (explicitListId && payload.list_id === undefined) {
    payload.list_id = explicitListId;
  }

  return payload;
}
