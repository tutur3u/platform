import {
  createMeetFollowup,
  type MeetFollowupContext,
} from '@tuturuuu/internal-api';
import {
  type ActionDraft,
  dueDateToLocal,
  followupReceiptKey,
  pickOpenList,
  readReceipt,
} from './action-items';

export type SaveTarget = {
  wsId: string;
  meetingId: string;
  userId: string;
  timezone: string;
  sourceUrl: string;
  storage: Storage | null;
  /** Lists of a board in the meeting workspace. */
  readLists: (boardId: string) => Promise<MeetFollowupContext['lists']>;
};

/** The server confirmed that nothing was written, so a retry is safe. */
export function isFollowupNotSaved(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'FOLLOWUP_NOT_SAVED'
  );
}

export type SaveOutcome = Pick<ActionDraft, 'status' | 'url' | 'requestId'>;

/**
 * Saves one reviewed action item as a task in the meeting workspace. The
 * receipt is shared with the single-item review, so neither path creates a
 * second task for the same item. A pending or unreadable receipt, or an
 * error that may follow a write, leaves the item for the host to check
 * instead of retrying.
 */
export async function saveActionItem(
  draft: ActionDraft,
  target: SaveTarget
): Promise<SaveOutcome> {
  const receipt = readReceipt(target.storage, target.userId, draft.key);
  if (receipt.status === 'saved')
    return { status: 'saved', url: receipt.url, requestId: draft.requestId };
  if (receipt.status === 'uncertain')
    return { status: 'uncertain', requestId: draft.requestId };
  let listId: string | null;
  try {
    listId = pickOpenList(await target.readLists(draft.boardId));
  } catch {
    return { status: 'rejected', requestId: draft.requestId };
  }
  if (!listId) return { status: 'no_list', requestId: draft.requestId };
  const key = followupReceiptKey(target.userId, draft.key);
  try {
    target.storage?.setItem(key, 'pending');
  } catch {
    return { status: 'rejected', requestId: draft.requestId };
  }
  try {
    const { url } = await createMeetFollowup(target.wsId, target.meetingId, {
      requestId: draft.requestId,
      startedAt: Date.now(),
      kind: 'task',
      ...(draft.source === 'manual' ? { source: 'manual' as const } : {}),
      title: draft.title.trim(),
      description: target.sourceUrl,
      workspaceId: target.wsId,
      userId: target.userId,
      boardId: draft.boardId,
      listId,
      timezone: target.timezone,
      start: '',
      end: '',
      due: dueDateToLocal(draft.dueDate),
      assignToMe: false,
      assigneeIds: draft.assigneeId ? [draft.assigneeId] : [],
      priority: 'normal',
    });
    try {
      target.storage?.setItem(key, JSON.stringify({ status: 'saved', url }));
    } catch {
      /* The task exists; the next open shows it from the meeting record. */
    }
    return { status: 'saved', url, requestId: draft.requestId };
  } catch (error) {
    if (isFollowupNotSaved(error)) {
      try {
        target.storage?.removeItem(key);
      } catch {
        return { status: 'uncertain', requestId: draft.requestId };
      }
      return { status: 'rejected', requestId: crypto.randomUUID() };
    }
    return { status: 'uncertain', requestId: draft.requestId };
  }
}
