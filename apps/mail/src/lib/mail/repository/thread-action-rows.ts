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
      .select('id,direction,thread_id')
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
  for (let start = 0; start < inbound.length; start += 250) {
    const batch = inbound.slice(start, start + 250);
    const states = await getStatesByMessageId(
      admin,
      batch.map((row) => row.id),
      userId
    );
    unreadCount += batch.filter((row) => !states.get(row.id)?.read_at).length;
  }
  return { inboundCount: inbound.length, unreadCount };
}
