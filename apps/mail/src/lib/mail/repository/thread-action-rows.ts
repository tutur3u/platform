import type { MailRouteContext } from '../types';
import { getStatesByMessageId } from './messages';
import { type AnyRecord, mailMessageTable } from './shared';

/** Stable ID pages avoid offset shifts while messages are inserted or deleted. */
export async function loadThreadActionRows(
  access: { admin: AnyRecord; mailbox: { groupPolicy?: unknown } },
  ctx: MailRouteContext,
  mailboxId: string,
  threadIds: string[]
): Promise<AnyRecord[]> {
  const before = new Date().toISOString();
  const rows: AnyRecord[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = mailMessageTable(access, ctx)
      .select('id,direction,thread_id,status')
      .eq('mailbox_id', mailboxId)
      .in('thread_id', threadIds)
      .lte('created_at', before)
      .order('id')
      .limit(250);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error)
      throw new Error(`Failed to load thread messages: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 250) return rows;
    cursor = data.at(-1)!.id;
  }
}

export async function countThreadReadState(
  admin: AnyRecord,
  userId: string,
  rows: AnyRecord[]
) {
  const inbound = rows.filter((row) => row.direction === 'inbound');
  let unreadCount = 0;
  let inboxInboundCount = 0;
  let inboxUnreadCount = 0;
  for (let start = 0; start < inbound.length; start += 250) {
    const batch = inbound.slice(start, start + 250);
    const states = await getStatesByMessageId(
      admin,
      batch.map((row) => row.id),
      userId
    );
    unreadCount += batch.filter((row) => !states.get(row.id)?.read_at).length;
    const inbox = getInboxReadCounts(batch, states);
    inboxInboundCount += inbox.inboxInboundCount;
    inboxUnreadCount += inbox.inboxUnreadCount;
  }
  return {
    inboundCount: inbound.length,
    unreadCount,
    inboxInboundCount,
    inboxUnreadCount,
  };
}

export function getInboxReadCounts(
  rows: AnyRecord[],
  states: Map<string, AnyRecord>
) {
  const inbox = rows.filter(
    (row) =>
      row.direction === 'inbound' &&
      row.status !== 'draft' &&
      row.status !== 'quarantined' &&
      !states.get(row.id)?.archived_at &&
      !states.get(row.id)?.trashed_at
  );
  return {
    inboxInboundCount: inbox.length,
    inboxUnreadCount: inbox.filter((row) => !states.get(row.id)?.read_at)
      .length,
  };
}
