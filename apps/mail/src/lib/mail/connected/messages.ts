import PostalMime, { type Address } from 'postal-mime';
import { parseCalendarInvitation } from '../calendar-invitation';
import { sanitizeMailHtml } from '../html';
import { attachmentBytes } from './attachment-bytes';
import { ConnectedMailError } from './config';
import type { ConnectedAccount } from './repository';
import { jsonBody, providerJson, providerRequest } from './transport';

export type ConnectedFolder =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'trash'
  | 'spam';
export type ConnectedMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
  starred: boolean;
  text?: string;
  html?: string;
  to?: string[];
  cc?: string[];
  replyTo?: string[];
  internetMessageId?: string;
  references?: string[];
  bcc?: string[];
  attachments?: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }[];
  invitation?: ReturnType<typeof parseCalendarInvitation>;
};
function addresses(values: Address[] | undefined): string[] {
  return (values ?? []).flatMap((value) =>
    value.group
      ? value.group.map((mailbox) => mailbox.address)
      : value.address
        ? [value.address]
        : []
  );
}
const gmailFolders = {
  inbox: 'in:inbox',
  sent: 'in:sent',
  drafts: 'in:drafts',
  archive: '-in:inbox -in:sent -in:drafts -in:trash -in:spam',
  trash: 'in:trash',
  spam: 'in:spam',
};
const graphFolders = {
  inbox: 'inbox',
  sent: 'sentitems',
  drafts: 'drafts',
  archive: 'archive',
  trash: 'deleteditems',
  spam: 'junkemail',
};
export async function listMessages(
  account: ConnectedAccount,
  folder: ConnectedFolder,
  cursor?: string,
  query = ''
) {
  if (account.provider === 'google') {
    const params = new URLSearchParams({
      maxResults: '25',
      q: `${gmailFolders[folder]} ${query}`,
      includeSpamTrash: 'true',
    });
    if (cursor) params.set('pageToken', cursor);
    const isDraft = folder === 'drafts';
    const page = await providerJson(
      account,
      `${isDraft ? '/drafts' : '/messages'}?${params}`
    );
    const messages: ConnectedMessage[] = [];
    // Sequential reads bound upstream concurrency and preserve rate-limit failure.
    for (const row of (isDraft ? page.drafts : page.messages) ?? []) {
      const message = await providerJson(
        account,
        `/messages/${encodeURIComponent(isDraft ? row.message.id : row.id)}?format=metadata`
      );
      const header = (name: string) =>
        message.payload?.headers?.find(
          (item: { name: string }) => item.name.toLowerCase() === name
        )?.value ?? '';
      messages.push({
        id: row.id,
        subject: header('subject'),
        from: header('from'),
        date: header('date'),
        unread: message.labelIds?.includes('UNREAD') ?? false,
        starred: message.labelIds?.includes('STARRED') ?? false,
      });
    }
    return { messages, nextCursor: page.nextPageToken ?? null };
  }
  const params = new URLSearchParams({
    $top: '25',
    $select: 'id,subject,from,receivedDateTime,isRead,flag',
    $orderby: 'receivedDateTime desc',
  });
  if (query) {
    params.delete('$orderby');
    params.set('$search', `"${query.replaceAll('"', '')}"`);
  }
  if (cursor) {
    let paging: { skip?: string; skiptoken?: string };
    try {
      paging = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    } catch {
      throw new ConnectedMailError(400, 'Invalid paging cursor');
    }
    if (paging.skip) params.set('$skip', paging.skip);
    if (paging.skiptoken) params.set('$skiptoken', paging.skiptoken);
  }
  const page = await providerJson(
    account,
    `/mailFolders/${graphFolders[folder]}/messages?${params}`
  );
  const next = page['@odata.nextLink'];
  const nextParams = next ? new URL(next).searchParams : null;
  const nextCursor = nextParams
    ? Buffer.from(
        JSON.stringify({
          skip: nextParams.get('$skip') ?? undefined,
          skiptoken: nextParams.get('$skiptoken') ?? undefined,
        })
      ).toString('base64url')
    : null;
  return {
    messages: (page.value ?? []).map(
      (row: any): ConnectedMessage => ({
        id: row.id,
        subject: row.subject ?? '',
        from: row.from?.emailAddress?.address ?? '',
        date: row.receivedDateTime,
        unread: !row.isRead,
        starred: row.flag?.flagStatus === 'flagged',
      })
    ),
    nextCursor,
  };
}
async function boundedBytes(response: Response) {
  const limit = 20 * 1024 * 1024;
  if (Number(response.headers.get('Content-Length')) > limit)
    throw new ConnectedMailError(413, 'Message exceeds preview limit');
  const reader = response.body?.getReader();
  if (!reader) throw new ConnectedMailError(502, 'Message body unavailable');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit)
        throw new ConnectedMailError(413, 'Message exceeds preview limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export async function readMessage(
  account: ConnectedAccount,
  id: string,
  draft = false
) {
  const path = `/${draft && account.provider === 'google' ? 'drafts' : 'messages'}/${encodeURIComponent(id)}`;
  let bytes: Buffer;
  if (account.provider === 'google') {
    const response = await providerRequest(account, `${path}?format=raw`);
    const data = JSON.parse((await boundedBytes(response)).toString());
    bytes = Buffer.from(
      (draft ? data.message?.raw : data.raw) ?? '',
      'base64url'
    );
  } else
    bytes = await boundedBytes(
      await providerRequest(account, `${path}/$value`)
    );
  const parsed = await PostalMime.parse(bytes);
  const attachments = parsed.attachments.map((file, index) => ({
    id: String(index),
    filename: file.filename || 'attachment',
    contentType: file.mimeType,
    size: attachmentBytes(file.content).byteLength,
  }));
  const invitations = parsed.attachments
    .filter((file) => file.mimeType === 'text/calendar')
    .map((file) => Buffer.from(attachmentBytes(file.content)).toString());
  const unique = [
    ...new Set(invitations.map((value) => value.replaceAll('\r\n', '\n'))),
  ];
  const detail: ConnectedMessage = {
    id,
    subject: parsed.subject ?? '',
    from: parsed.from?.address ?? '',
    date: parsed.date ?? '',
    unread: false,
    starred: false,
    text: parsed.text ?? '',
    html: sanitizeMailHtml(parsed.html ?? ''),
    to: addresses(parsed.to),
    cc: addresses(parsed.cc),
    bcc: addresses(parsed.bcc),
    replyTo: addresses(parsed.replyTo),
    internetMessageId: parsed.messageId,
    references: parsed.references?.match(/<[^<>]+>/gu) ?? [],
    attachments,
    invitation:
      unique.length === 1
        ? parseCalendarInvitation(unique[0]!, account.address)
        : null,
  };
  return { detail, files: parsed.attachments };
}
export type MessageAction =
  | 'mark_read'
  | 'mark_unread'
  | 'archive'
  | 'trash'
  | 'restore'
  | 'star'
  | 'unstar';
export async function updateMessage(
  account: ConnectedAccount,
  id: string,
  action: MessageAction
) {
  const path = `/messages/${encodeURIComponent(id)}`;
  if (account.provider === 'google') {
    if (action === 'trash' || action === 'restore')
      return providerJson(
        account,
        `${path}/${action === 'trash' ? 'trash' : 'untrash'}`,
        { method: 'POST' }
      );
    const labels = {
      mark_read: { removeLabelIds: ['UNREAD'] },
      mark_unread: { addLabelIds: ['UNREAD'] },
      archive: { removeLabelIds: ['INBOX'] },
      star: { addLabelIds: ['STARRED'] },
      unstar: { removeLabelIds: ['STARRED'] },
    };
    return providerJson(account, `${path}/modify`, jsonBody(labels[action]));
  }
  if (['archive', 'trash', 'restore'].includes(action))
    return providerJson(
      account,
      `${path}/move`,
      jsonBody({
        destinationId:
          action === 'archive'
            ? 'archive'
            : action === 'trash'
              ? 'deleteditems'
              : 'inbox',
      })
    );
  return providerJson(
    account,
    path,
    jsonBody(
      action === 'star' || action === 'unstar'
        ? { flag: { flagStatus: action === 'star' ? 'flagged' : 'notFlagged' } }
        : { isRead: action === 'mark_read' },
      'PATCH'
    )
  );
}
