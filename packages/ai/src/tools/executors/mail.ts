import {
  type InternalApiClientOptions,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api/client';
import {
  getMailBootstrap,
  getMailThread,
  type ListMailThreadsParams,
  listMailThreads,
  type MailMailbox,
  type MailThreadSummary,
} from '@tuturuuu/internal-api/mail';
import { Effect, Either } from '@tuturuuu/utils/effect';
import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';
import { draftEmailReply } from './mail-draft';
import {
  boundedRecipients,
  describeMailError,
  MAIL_LIST_DEFAULT_LIMIT,
  MAIL_LIST_MAX_LIMIT,
  MAIL_MAX_MAILBOX_FANOUT,
  MAIL_MESSAGE_MAX_CHARS,
  MAIL_SCOPE_NOTE,
  MAIL_SNIPPET_MAX_CHARS,
  MAIL_THREAD_DEFAULT_MESSAGES,
  MAIL_THREAD_MAX_CHARS,
  MAIL_THREAD_MAX_MESSAGES,
  MAIL_UNTRUSTED_NOTICE,
  messagePlainText,
  normalizeWhitespace,
  resolveMailBaseUrl,
  truncateText,
} from './mail-helpers';

type MailArgs = Record<string, unknown>;
type MailFolder = NonNullable<ListMailThreadsParams['folder']>;

const clampInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number
) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
const optionalString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export async function executeMailTool(
  name: string,
  args: MailArgs,
  ctx: MiraToolContext
) {
  if (!ctx.requestHeaders)
    return {
      success: false,
      error:
        'Mail is unavailable in this session. Open Tuturuuu Mail to read or reply to email.',
    };
  const resolved = resolveMailBaseUrl();
  if (!resolved.ok) return { success: false, error: resolved.error };
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const options = withForwardedInternalApiAuth(ctx.requestHeaders, {
    baseUrl: resolved.baseUrl,
  });
  return Effect.runPromise(
    Effect.tryPromise({
      try: (): Promise<Record<string, unknown>> => {
        switch (name) {
          case 'list_recent_emails':
            return listRecentEmails(wsId, args, options);
          case 'get_email_thread':
            return getEmailThread(wsId, args, options);
          case 'draft_email_reply':
            return draftEmailReply(
              { userId: ctx.userId, wsId, chatId: ctx.chatId },
              args,
              options
            );
          default:
            return Promise.resolve({
              success: false,
              error: 'Unknown mail operation',
            });
        }
      },
      catch: describeMailError,
    }).pipe(
      Effect.catchAll((failure) =>
        Effect.succeed({ success: false, ...failure })
      )
    )
  );
}

async function loadMailboxes(wsId: string, options: InternalApiClientOptions) {
  const bootstrap = await getMailBootstrap(wsId, options, false);
  return (bootstrap.mailboxes ?? []).filter(
    (mailbox) => mailbox.status === 'active' || mailbox.status === 'archived'
  );
}

function summarizeThread(
  thread: MailThreadSummary,
  mailbox: Pick<MailMailbox, 'address' | 'id'> | undefined
) {
  const ownAddress = mailbox?.address.toLowerCase();
  const sender =
    (thread.participants ?? []).find(
      (participant) => participant.address.toLowerCase() !== ownAddress
    ) ?? thread.participants?.[0];
  const snippet = truncateText(
    normalizeWhitespace(thread.latestSnippet ?? ''),
    MAIL_SNIPPET_MAX_CHARS
  ).text;
  return {
    threadId: thread.id,
    mailboxId: thread.mailboxId,
    mailboxAddress: mailbox?.address ?? null,
    lastMessageAt: thread.lastMessageAt,
    unread: thread.unreadCount > 0,
    unreadCount: thread.unreadCount,
    messageCount: thread.messageCount,
    hasAttachments: thread.hasAttachments,
    untrusted: {
      subject: thread.subject,
      sender: sender
        ? { name: sender.displayName, address: sender.address }
        : null,
      snippet,
    },
  };
}

async function listRecentEmails(
  wsId: string,
  args: MailArgs,
  options: InternalApiClientOptions
) {
  const limit = clampInt(
    args.limit,
    MAIL_LIST_DEFAULT_LIMIT,
    1,
    MAIL_LIST_MAX_LIMIT
  );
  const folder = (optionalString(args.folder) ?? 'inbox') as MailFolder;
  const unreadOnly = args.unreadOnly === true;
  const sinceDays =
    args.sinceDays === undefined
      ? undefined
      : clampInt(args.sinceDays, 7, 1, 90);
  const cutoff =
    sinceDays === undefined
      ? undefined
      : new Date(Date.now() - sinceDays * 86_400_000);
  const query = [
    optionalString(args.query)?.slice(0, 200),
    unreadOnly ? 'is:unread' : undefined,
    cutoff ? `after:${cutoff.toISOString().slice(0, 10)}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const mailboxes = await loadMailboxes(wsId, options);
  const requestedMailboxId = optionalString(args.mailboxId);
  const candidates = requestedMailboxId
    ? mailboxes.filter((mailbox) => mailbox.id === requestedMailboxId)
    : mailboxes;
  if (requestedMailboxId && candidates.length === 0)
    return {
      success: false,
      error:
        'That mailbox is not available to this user in this workspace. Nothing was read.',
      scope: MAIL_SCOPE_NOTE,
    };
  const searched = candidates.slice(0, MAIL_MAX_MAILBOX_FANOUT);
  const results = await Effect.runPromise(
    Effect.forEach(
      searched,
      (mailbox) =>
        Effect.either(
          Effect.tryPromise({
            try: () =>
              listMailThreads(
                wsId,
                mailbox.id,
                {
                  folder,
                  page: 1,
                  pageSize: limit,
                  query: query || undefined,
                },
                options
              ),
            catch: describeMailError,
          })
        ),
      { concurrency: 3 }
    )
  );

  const failedMailboxes: Array<{ mailboxId: string; error: string }> = [];
  const threads: MailThreadSummary[] = [];
  results.forEach((result, index) => {
    const mailbox = searched[index];
    if (!mailbox) return;
    if (Either.isLeft(result))
      failedMailboxes.push({ mailboxId: mailbox.id, error: result.left.error });
    else threads.push(...(result.right.threads ?? []));
  });
  if (searched.length > 0 && failedMailboxes.length === searched.length)
    return {
      success: false,
      error: failedMailboxes[0]?.error ?? 'Mail request failed',
      failedMailboxes,
    };

  const byId = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const filtered = threads
    .filter((thread) => !unreadOnly || thread.unreadCount > 0)
    .filter(
      (thread) =>
        !cutoff ||
        (thread.lastMessageAt !== null &&
          new Date(thread.lastMessageAt).getTime() >= cutoff.getTime())
    )
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() -
        new Date(a.lastMessageAt ?? 0).getTime()
    );
  return {
    success: true,
    workspaceId: wsId,
    folder,
    scope: MAIL_SCOPE_NOTE,
    contentTrust: MAIL_UNTRUSTED_NOTICE,
    mailboxesSearched: searched.length,
    mailboxesOmitted: candidates.length - searched.length,
    ...(failedMailboxes.length ? { failedMailboxes } : {}),
    truncated: filtered.length > limit,
    threads: filtered
      .slice(0, limit)
      .map((thread) => summarizeThread(thread, byId.get(thread.mailboxId))),
  };
}

async function getEmailThread(
  wsId: string,
  args: MailArgs,
  options: InternalApiClientOptions
) {
  const mailboxId = optionalString(args.mailboxId);
  const threadId = optionalString(args.threadId);
  if (!mailboxId || !threadId)
    return { success: false, error: 'mailboxId and threadId are required.' };
  const maxMessages = clampInt(
    args.maxMessages,
    MAIL_THREAD_DEFAULT_MESSAGES,
    1,
    MAIL_THREAD_MAX_MESSAGES
  );
  const detail = await getMailThread(wsId, mailboxId, threadId, options);
  const all = detail.messages ?? [];
  const recent = all.slice(-maxMessages);
  let remaining = MAIL_THREAD_MAX_CHARS;
  let bodiesTruncated = false;
  const included: Array<Record<string, unknown>> = [];
  // Walk newest-first so the latest messages keep their budget.
  for (const message of [...recent].reverse()) {
    if (remaining <= 0) {
      bodiesTruncated = true;
      break;
    }
    const body = truncateText(
      messagePlainText(message),
      Math.min(MAIL_MESSAGE_MAX_CHARS, remaining)
    );
    remaining -= body.text.length;
    bodiesTruncated ||= body.truncated;
    included.unshift({
      messageId: message.id,
      direction: message.direction ?? null,
      status: message.status,
      sentAt: message.sentAt ?? message.receivedAt ?? message.createdAt,
      unread: message.unread,
      attachmentCount: message.attachments?.length ?? 0,
      untrusted: {
        from: { name: message.fromName, address: message.fromAddress },
        to: boundedRecipients(message.recipients ?? [], 'to'),
        cc: boundedRecipients(message.recipients ?? [], 'cc'),
        subject: message.subject,
        body: body.text,
        bodyTruncated: body.truncated,
      },
    });
  }
  return {
    success: true,
    workspaceId: wsId,
    scope: MAIL_SCOPE_NOTE,
    contentTrust: MAIL_UNTRUSTED_NOTICE,
    thread: {
      threadId: detail.thread.id,
      mailboxId: detail.thread.mailboxId,
      messageCount: detail.thread.messageCount,
      status: detail.thread.status,
      untrusted: { subject: detail.thread.subject },
    },
    omittedOlderMessages: all.length - included.length,
    bodiesTruncated,
    messages: included,
  };
}
