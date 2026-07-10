import { escapeMailLike, parseMailSearch } from '../search';
import type { ListMailMessagesParams } from '../types';
import { type AnyRecord, privateTable } from './shared';

type SearchResult = {
  rows: AnyRecord[];
  total: number;
};

function intersectIds(current: Set<string> | null, next: Iterable<string>) {
  const nextSet = new Set(next);
  if (current == null) return nextSet;
  return new Set([...current].filter((id) => nextSet.has(id)));
}

async function recipientMessageIds({
  admin,
  kind,
  value,
}: {
  admin: AnyRecord;
  kind: 'bcc' | 'cc' | 'to';
  value: string;
}) {
  const { data, error } = await privateTable(admin, 'mail_recipients')
    .select('message_id')
    .eq('kind', kind)
    .ilike('address', `%${escapeMailLike(value)}%`)
    .limit(5000);
  if (error)
    throw new Error(`Failed to search mail recipients: ${error.message}`);
  return (data ?? []).map((row: AnyRecord) => row.message_id as string);
}

async function labelMessageIds({
  admin,
  mailboxId,
  value,
}: {
  admin: AnyRecord;
  mailboxId: string;
  value: string;
}) {
  const { data: labels, error: labelError } = await privateTable(
    admin,
    'mail_labels'
  )
    .select('id, name, slug')
    .eq('mailbox_id', mailboxId);
  if (labelError)
    throw new Error(`Failed to search mail labels: ${labelError.message}`);

  const normalized = value.trim().toLowerCase();
  const labelIds = (labels ?? [])
    .filter(
      (row: AnyRecord) =>
        row.slug?.toLowerCase() === normalized ||
        row.name?.toLowerCase() === normalized
    )
    .map((row: AnyRecord) => row.id as string);
  if (labelIds.length === 0) return [];

  const { data, error } = await privateTable(admin, 'mail_message_labels')
    .select('message_id')
    .in('label_id', labelIds)
    .limit(5000);
  if (error)
    throw new Error(`Failed to search message labels: ${error.message}`);
  return (data ?? []).map((row: AnyRecord) => row.message_id as string);
}

async function folderMessageIds({
  admin,
  folderId,
}: {
  admin: AnyRecord;
  folderId: string;
}) {
  const { data, error } = await privateTable(admin, 'mail_message_folders')
    .select('message_id')
    .eq('folder_id', folderId)
    .limit(5000);
  if (error) throw new Error(`Failed to search mail folder: ${error.message}`);
  return (data ?? []).map((row: AnyRecord) => row.message_id as string);
}

function idsWithTimestamp(rows: AnyRecord[], column: string) {
  return rows
    .filter((row) => row[column])
    .map((row) => row.message_id as string);
}

export async function queryMailMessageRows({
  admin,
  mailboxId,
  params,
  userId,
}: {
  admin: AnyRecord;
  mailboxId: string;
  params: ListMailMessagesParams;
  userId: string;
}): Promise<SearchResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 40), 100);
  const parsed = parseMailSearch(params.query);
  const { data: stateRows, error: stateError } = await privateTable(
    admin,
    'mail_message_user_state'
  )
    .select('message_id, read_at, starred_at, archived_at, trashed_at')
    .eq('mailbox_id', mailboxId)
    .eq('user_id', userId)
    .limit(5000);
  if (stateError)
    throw new Error(`Failed to search mail state: ${stateError.message}`);

  const states = stateRows ?? [];
  const readIds = idsWithTimestamp(states, 'read_at');
  const starredIds = idsWithTimestamp(states, 'starred_at');
  const archivedIds = idsWithTimestamp(states, 'archived_at');
  const trashedIds = idsWithTimestamp(states, 'trashed_at');
  let includedIds: Set<string> | null = null;
  const excludedIds = new Set<string>();

  if (params.folderId) {
    includedIds = intersectIds(
      includedIds,
      await folderMessageIds({ admin, folderId: params.folderId })
    );
  }
  if (params.label) {
    includedIds = intersectIds(
      includedIds,
      await labelMessageIds({ admin, mailboxId, value: params.label })
    );
  }
  for (const recipient of parsed.recipients) {
    includedIds = intersectIds(
      includedIds,
      await recipientMessageIds({ admin, ...recipient })
    );
  }
  for (const label of parsed.labels) {
    includedIds = intersectIds(
      includedIds,
      await labelMessageIds({ admin, mailboxId, value: label })
    );
  }

  const requiredStateSets: string[][] = [];
  if (params.folder === 'starred' || parsed.states.includes('starred')) {
    requiredStateSets.push(starredIds);
  }
  if (params.folder === 'archive' || parsed.states.includes('archived')) {
    requiredStateSets.push(archivedIds);
  }
  if (parsed.states.includes('trash')) requiredStateSets.push(trashedIds);
  if (parsed.states.includes('read')) requiredStateSets.push(readIds);
  for (const ids of requiredStateSets)
    includedIds = intersectIds(includedIds, ids);

  if (params.folder === 'inbox' || !params.folder) {
    for (const id of [...archivedIds, ...trashedIds]) excludedIds.add(id);
  }
  if (parsed.states.includes('unread')) {
    for (const id of readIds) excludedIds.add(id);
  }
  if (includedIds?.size === 0) return { rows: [], total: 0 };

  let query = privateTable(admin, 'mail_messages')
    .select('*', { count: 'exact' })
    .eq('mailbox_id', mailboxId);

  if (params.folder === 'drafts' || parsed.states.includes('draft')) {
    query = query.eq('status', 'draft');
  } else if (params.folder === 'sent' || parsed.states.includes('sent')) {
    query = query.eq('direction', 'outbound').neq('status', 'draft');
  } else if (params.folder === 'spam') {
    query = query.eq('status', 'quarantined');
  } else if (params.folder === 'trash') {
    query = trashedIds.length
      ? query.or(`status.eq.quarantined,id.in.(${trashedIds.join(',')})`)
      : query.eq('status', 'quarantined');
  } else if (params.folder === 'inbox' || !params.folder) {
    query = query
      .eq('direction', 'inbound')
      .neq('status', 'draft')
      .neq('status', 'quarantined');
  }

  if (includedIds) query = query.in('id', [...includedIds]);
  if (excludedIds.size > 0) {
    query = query.not('id', 'in', `(${[...excludedIds].join(',')})`);
  }
  if (parsed.hasAttachment) query = query.eq('has_attachments', true);
  if (parsed.after)
    query = query.gte('created_at', `${parsed.after}T00:00:00.000Z`);
  if (parsed.before)
    query = query.lt('created_at', `${parsed.before}T00:00:00.000Z`);
  for (const from of parsed.from) {
    query = query.ilike('from_address', `%${escapeMailLike(from)}%`);
  }
  for (const subject of parsed.subject) {
    query = query.ilike('subject', `%${escapeMailLike(subject)}%`);
  }
  if (parsed.freeText.length > 0) {
    query = query.textSearch('search_document', parsed.freeText.join(' '), {
      config: 'simple',
      type: 'websearch',
    });
  }

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(start, start + pageSize - 1);
  if (error) throw new Error(`Failed to list mail messages: ${error.message}`);

  return { rows: data ?? [], total: count ?? 0 };
}
