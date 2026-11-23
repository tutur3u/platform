/** One action item under review before it becomes a task. */
export type ActionDraft = {
  /** Receipt key; AI note items share it with the single-item review. */
  key: string;
  title: string;
  /** AI notes need Meet AI; pasted and typed items are host-created. */
  source: 'notes' | 'manual';
  include: boolean;
  assigneeId: string | null;
  /** Local calendar date, `YYYY-MM-DD`, or empty for no due date. */
  dueDate: string;
  boardId: string;
  requestId: string;
  status: 'idle' | 'saving' | 'saved' | 'rejected' | 'uncertain';
  url?: string;
};

export type ActionSuggestion = {
  key: string;
  title: string;
  owner: string | null;
  ownerId?: string | null;
};

export type ActionMember = { id: string; displayName: string | null };

const MAX_PASTED_ITEMS = 50;
const MAX_TITLE = 255;
const BULLET = /^\s*(?:[-*+•]|\d+[.)])?\s*(?:\[[ xX]\]\s*)?/;

/** Splits pasted Mira /actions output (or any list) into item titles. */
export function parsePastedActions(text: string) {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const title = line
      .replace(BULLET, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .trim()
      .slice(0, MAX_TITLE);
    const key = title.toLocaleLowerCase();
    if (!title || title.endsWith(':') || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length === MAX_PASTED_ITEMS) break;
  }
  return titles;
}

/** A suggested owner assigns only on an exact id or a unique name match. */
export function matchOwner(
  suggestion: Pick<ActionSuggestion, 'owner' | 'ownerId'>,
  members: ActionMember[]
) {
  if (suggestion.ownerId) {
    const byId = members.find((member) => member.id === suggestion.ownerId);
    if (byId) return byId.id;
  }
  const name = suggestion.owner?.trim().toLocaleLowerCase();
  if (!name) return null;
  const matches = members.filter(
    (member) => member.displayName?.trim().toLocaleLowerCase() === name
  );
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

/** Due dates end the chosen local day. */
export function dueDateToLocal(dueDate: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? `${dueDate}T23:59` : '';
}

/** Follow-ups go to the first open list on the board. */
export function pickOpenList(
  lists: Array<{ id: string; status: string | null }>
) {
  return (
    lists.find(
      (list) => !['done', 'closed', 'documents'].includes(list.status ?? '')
    )?.id ?? null
  );
}

export function draftFromSuggestion(
  suggestion: ActionSuggestion,
  members: ActionMember[],
  boardId: string
): ActionDraft {
  return {
    key: suggestion.key,
    title: suggestion.title.trim().slice(0, MAX_TITLE),
    source: 'notes',
    include: true,
    assigneeId: matchOwner(suggestion, members),
    dueDate: '',
    boardId,
    requestId: crypto.randomUUID(),
    status: 'idle',
  };
}

export function manualDraft(
  meetingId: string,
  title: string,
  boardId: string
): ActionDraft {
  const id = crypto.randomUUID();
  return {
    key: `${meetingId}:manual:${id}`,
    title,
    source: 'manual',
    include: true,
    assigneeId: null,
    dueDate: '',
    boardId,
    requestId: id,
    status: 'idle',
  };
}

export const followupReceiptKey = (userId: string, key: string) =>
  `meet-followup:${userId}:${key}`;

/** Reads the receipt the single-item review also writes. */
export function readReceipt(
  storage: Pick<Storage, 'getItem'> | null,
  userId: string,
  key: string
):
  | { status: 'none' }
  | { status: 'saved'; url: string }
  | { status: 'uncertain' } {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(followupReceiptKey(userId, key)) ?? null;
  } catch {
    return { status: 'uncertain' };
  }
  if (raw === null) return { status: 'none' };
  try {
    const saved = JSON.parse(raw);
    if (
      saved?.status === 'saved' &&
      typeof saved.url === 'string' &&
      /^https:\/\//.test(saved.url)
    )
      return { status: 'saved', url: saved.url };
  } catch {
    /* A pending or unreadable receipt needs a check of the destination. */
  }
  return { status: 'uncertain' };
}

export function savable(draft: ActionDraft) {
  return (
    draft.include &&
    !!draft.title.trim() &&
    !!draft.boardId &&
    (draft.status === 'idle' || draft.status === 'rejected')
  );
}
