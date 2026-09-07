import { readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  deterministicUuid,
  parseTakeoutMessage,
  readMboxMessages,
  slugifyGoogleLabel,
  type TakeoutMessage,
} from '../src/lib/mail/import/google-takeout';
import {
  createImportAdmin,
  ensureImportLabels,
  finalizeThreads,
  loadExistingMessageKeys,
  loadImportMailbox,
  type PreparedImportMessage,
  persistImportBatch,
  type ThreadSummary,
} from './google-takeout-db';
import {
  createTakeoutObjectStore,
  uploadTakeoutMessage,
} from './google-takeout-r2';

const NON_CUSTOM_LABELS = new Set([
  'archived',
  'draft',
  'drafts',
  'inbox',
  'sent',
  'spam',
  'starred',
  'trash',
  'unread',
]);

type Args = {
  apply: boolean;
  batchSize: number;
  mailbox: string | null;
  report: string;
  root: string;
};

type MailboxReport = {
  attachmentBytes: number;
  attachments: number;
  duplicates: number;
  labels: Record<string, number>;
  messages: number;
  skippedExisting: number;
  threads: number;
};

function parseArgs(): Args {
  const values = new Map<string, string>();
  let apply = false;
  for (const argument of process.argv.slice(2)) {
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    const separator = argument.indexOf('=');
    if (!argument.startsWith('--') || separator < 3) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    values.set(argument.slice(2, separator), argument.slice(separator + 1));
  }
  const root = values.get('root');
  if (!root) throw new Error('--root=/path/to/mail-data is required');
  const batchSize = Number(values.get('batch-size') ?? 10);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error('--batch-size must be an integer from 1 to 50');
  }
  return {
    apply,
    batchSize,
    mailbox: values.get('mailbox')?.trim().toLowerCase() || null,
    report: resolve(
      values.get('report') ?? join(root, '..', 'import-report.json')
    ),
    root: resolve(root),
  };
}

function normalizeSubject(subject?: string) {
  return (subject?.trim() || '(no subject)')
    .replace(/^(?:(?:re|fw|fwd):\s*)+/iu, '')
    .trim()
    .toLowerCase();
}

function customLabels(message: TakeoutMessage) {
  return message.gmailLabels.flatMap((name) => {
    if (NON_CUSTOM_LABELS.has(name.toLowerCase())) return [];
    const slug = slugifyGoogleLabel(name);
    return slug ? [{ name, slug }] : [];
  });
}

function threadStatus(message: TakeoutMessage): ThreadSummary['status'] {
  if (message.isTrashed) return 'trash';
  if (message.status === 'quarantined') return 'spam';
  if (message.isArchived) return 'archived';
  return 'active';
}

function updateThread(
  threads: Map<string, ThreadSummary>,
  message: TakeoutMessage,
  threadId: string
) {
  const subject = message.email.subject?.trim() || '(no subject)';
  const existing = threads.get(threadId);
  const nextStatus = threadStatus(message);
  if (!existing) {
    threads.set(threadId, {
      firstMessageAt: message.date,
      id: threadId,
      lastMessageAt: message.date,
      messageCount: 1,
      normalizedSubject: normalizeSubject(subject),
      status: nextStatus,
      subject,
      unreadCount: Number(message.direction === 'inbound' && !message.isRead),
    });
    return;
  }
  existing.firstMessageAt =
    existing.firstMessageAt < message.date
      ? existing.firstMessageAt
      : message.date;
  if (message.date >= existing.lastMessageAt) {
    existing.lastMessageAt = message.date;
    existing.subject = subject;
    existing.normalizedSubject = normalizeSubject(subject);
  }
  existing.messageCount += 1;
  existing.unreadCount += Number(
    message.direction === 'inbound' && !message.isRead
  );
  const rank = { active: 3, archived: 2, spam: 1, trash: 0 } as const;
  if (rank[nextStatus] > rank[existing.status]) existing.status = nextStatus;
}

function initialThreadRow(mailboxId: string, summary: ThreadSummary) {
  return {
    created_at: summary.firstMessageAt,
    id: summary.id,
    last_message_at: summary.lastMessageAt,
    mailbox_id: mailboxId,
    message_count: 0,
    normalized_subject: summary.normalizedSubject,
    status: summary.status,
    subject: summary.subject,
    unread_count: 0,
    updated_at: summary.lastMessageAt,
  };
}

async function listMailboxDirectories(root: string, only: string | null) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.includes('@'))
    .map((entry) => entry.name.toLowerCase())
    .filter((address) => !only || address === only)
    .sort();
}

async function listMboxes(root: string, account: string) {
  const dir = join(root, account);
  return (await readdir(dir))
    .filter((name) => name.endsWith('.mbox'))
    .sort((left, right) => {
      const leftDeleted = left.toLowerCase().includes('deleted');
      const rightDeleted = right.toLowerCase().includes('deleted');
      return (
        Number(rightDeleted) - Number(leftDeleted) || left.localeCompare(right)
      );
    })
    .map((name) => join(dir, name));
}

async function importMailbox({
  account,
  args,
}: {
  account: string;
  args: Args;
}) {
  const admin = args.apply ? await createImportAdmin() : null;
  const mailbox = admin
    ? await loadImportMailbox(admin, account)
    : {
        created_by: null,
        id: deterministicUuid('dry-run-mailbox', account),
        state_user_id: null,
      };
  const existing = admin
    ? await loadExistingMessageKeys(admin, mailbox.id)
    : {
        internetMessageIds: new Set<string>(),
        providerMessageIds: new Set<string>(),
      };
  const seenInternetIds = new Set<string>();
  const seenProviderIds = new Set<string>();
  const threads = new Map<string, ThreadSummary>();
  const labelNames = new Map<string, string>();
  const labelCounts = new Map<string, number>();
  const pending: PreparedImportMessage[] = [];
  const objectStore = args.apply ? createTakeoutObjectStore() : null;
  let duplicates = 0;
  let skippedExisting = 0;
  let messages = 0;
  let attachments = 0;
  let attachmentBytes = 0;

  const flush = async () => {
    if (!(admin && objectStore) || pending.length === 0) return;
    const labelIds = await ensureImportLabels({
      admin,
      customLabels: labelNames,
      mailboxId: mailbox.id,
    });
    const ready = await Promise.all(
      pending.map(async (message) => ({
        ...message,
        ...(await uploadTakeoutMessage({ account, message, objectStore })),
      }))
    );
    const threadRows = [
      ...new Map(
        ready.map((message) => {
          const summary = threads.get(message.threadId)!;
          return [message.threadId, initialThreadRow(mailbox.id, summary)];
        })
      ).values(),
    ];
    await persistImportBatch({
      admin,
      labelIds,
      mailboxOwnerId: mailbox.state_user_id,
      messages: ready,
      threadRows,
    });
    pending.length = 0;
  };

  for (const mboxPath of await listMboxes(args.root, account)) {
    const deletedMbox = basename(mboxPath).toLowerCase().includes('deleted');
    for await (const raw of readMboxMessages(mboxPath)) {
      const parsed = await parseTakeoutMessage({ account, deletedMbox, raw });
      const internetId = parsed.email.messageId?.trim() || null;
      const providerExists = existing.providerMessageIds.has(
        parsed.providerMessageId
      );
      if (
        seenProviderIds.has(parsed.providerMessageId) ||
        (internetId && seenInternetIds.has(internetId)) ||
        (!providerExists &&
          internetId &&
          existing.internetMessageIds.has(internetId))
      ) {
        duplicates += 1;
        continue;
      }
      const subjectKey = normalizeSubject(parsed.email.subject);
      const threadKey = parsed.gmailThreadId ?? `subject:${subjectKey}`;
      const threadId = deterministicUuid(
        'google-takeout-thread',
        `${mailbox.id}:${threadKey}`
      );
      updateThread(threads, parsed, threadId);
      seenProviderIds.add(parsed.providerMessageId);
      if (internetId) seenInternetIds.add(internetId);
      const labels = customLabels(parsed);
      for (const label of parsed.gmailLabels) {
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      }
      for (const label of labels) labelNames.set(label.slug, label.name);
      if (providerExists) {
        skippedExisting += 1;
      } else {
        messages += 1;
        attachments += parsed.email.attachments.length;
        attachmentBytes += parsed.attachmentBytes;
      }
      if (args.apply) {
        const messageId = deterministicUuid(
          'google-takeout-message',
          `${mailbox.id}:${parsed.providerMessageId}`
        );
        pending.push({
          account,
          attachmentRows: [],
          customLabels: labels.map((label) => label.slug),
          ...parsed,
          mailboxId: mailbox.id,
          messageId,
          rawMessageId: deterministicUuid(
            'google-takeout-raw-message',
            parsed.providerMessageId
          ),
          storedObjects: [],
          threadId,
        });
        if (pending.length >= args.batchSize) await flush();
      }
      if ((messages + skippedExisting) % 250 === 0) {
        console.log(
          `${account}: processed ${messages + skippedExisting} messages`
        );
      }
    }
  }
  await flush();
  if (admin && threads.size) {
    await finalizeThreads({
      admin,
      mailboxId: mailbox.id,
      threads: [...threads.values()],
    });
  }
  return {
    attachmentBytes,
    attachments,
    duplicates,
    labels: Object.fromEntries(
      [...labelCounts].sort(([left], [right]) => left.localeCompare(right))
    ),
    messages,
    skippedExisting,
    threads: threads.size,
  } satisfies MailboxReport;
}

async function main() {
  const args = parseArgs();
  const accounts = await listMailboxDirectories(args.root, args.mailbox);
  if (accounts.length === 0)
    throw new Error('No matching mailbox directories found');
  console.log(
    `${args.apply ? 'APPLY' : 'DRY RUN'}: ${accounts.length} Google mailboxes from ${args.root}`
  );
  const mailboxes: Record<string, MailboxReport> = {};
  for (const account of accounts) {
    mailboxes[account] = await importMailbox({ account, args });
    console.log(`${account}:`, mailboxes[account]);
  }
  const report = {
    applied: args.apply,
    completedAt: new Date().toISOString(),
    mailboxes,
    totals: Object.values(mailboxes).reduce(
      (total, mailbox) => ({
        attachmentBytes: total.attachmentBytes + mailbox.attachmentBytes,
        attachments: total.attachments + mailbox.attachments,
        duplicates: total.duplicates + mailbox.duplicates,
        messages: total.messages + mailbox.messages,
        skippedExisting: total.skippedExisting + mailbox.skippedExisting,
        threads: total.threads + mailbox.threads,
      }),
      {
        attachmentBytes: 0,
        attachments: 0,
        duplicates: 0,
        messages: 0,
        skippedExisting: 0,
        threads: 0,
      }
    ),
  };
  await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${args.report}`);
  console.log('Totals:', report.totals);
}

await main();
