import {
  CORRESPONDENT_WINDOW_DAYS,
  type CorrespondentEvent,
  rankCorrespondents,
} from '../correspondents-ranking';
import type { MailRouteContext } from '../types';
import { requireMailboxAccess } from './bootstrap';
import { loadAllRows } from './search';
import {
  type AnyRecord,
  type MailTableName,
  mailMessageTable,
  privateTable,
} from './shared';

/** Upper bound on messages scanned per request, newest first. */
export const CORRESPONDENT_SCAN_LIMIT = 2000;
const SCAN_PAGE_SIZE = 1000;
const RECIPIENT_CHUNK_SIZE = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

type SenderBlock = { kind: 'address' | 'domain'; value: string };

function isBlocked(email: string, blocks: readonly SenderBlock[]) {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return blocks.some((block) =>
    block.kind === 'address'
      ? block.value === email
      : domain === block.value || domain.endsWith(`.${block.value}`)
  );
}

async function loadSenderBlocks(admin: AnyRecord, mailboxId: string) {
  const { data, error } = await privateTable(
    admin,
    'mail_sender_blocks' as MailTableName
  )
    .select('kind, value')
    .eq('mailbox_id', mailboxId)
    .limit(1000);
  if (error) {
    // Blocks only narrow suggestions; a failed read must not break compose.
    console.warn('[mail] sender blocks unavailable for correspondents', {
      mailboxId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as SenderBlock[];
}

async function loadRecentMessages(
  access: Parameters<typeof mailMessageTable>[0],
  ctx: MailRouteContext,
  mailboxId: string,
  since: string
) {
  const rows: AnyRecord[] = [];
  for (
    let start = 0;
    start < CORRESPONDENT_SCAN_LIMIT;
    start += SCAN_PAGE_SIZE
  ) {
    const { data, error } = await mailMessageTable(access, ctx)
      .select('id, direction, from_address, from_name, created_at')
      .eq('mailbox_id', mailboxId)
      .gte('created_at', since)
      .not('status', 'in', '(draft,quarantined)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(start, start + SCAN_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to load recent mail: ${error.message}`);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SCAN_PAGE_SIZE) break;
  }
  return rows;
}

async function loadOutboundRecipients(admin: AnyRecord, messageIds: string[]) {
  const chunks: string[][] = [];
  for (let start = 0; start < messageIds.length; start += RECIPIENT_CHUNK_SIZE)
    chunks.push(messageIds.slice(start, start + RECIPIENT_CHUNK_SIZE));
  const pages = await Promise.all(
    chunks.map((ids) =>
      loadAllRows(
        () =>
          privateTable(admin, 'mail_recipients')
            .select('message_id, address, display_name')
            .in('message_id', ids)
            .in('kind', ['to', 'cc', 'bcc'])
            .order('message_id')
            .order('id'),
        'Failed to load mail recipients'
      )
    )
  );
  return pages.flat();
}

/**
 * Ranks the addresses this mailbox exchanged mail with in the last 180 days:
 * senders of inbound mail and to/cc/bcc recipients of outbound mail. Only
 * members who may compose from the mailbox can read it; group mailboxes only
 * include the caller's own messages, and quarantined, trashed and blocked mail
 * is left out.
 */
export async function listMailCorrespondents({
  ctx,
  mailboxId,
  query,
  limit,
  now = Date.now(),
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  query: string;
  limit: number;
  now?: number;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, [
    'admin',
    'owner',
    'sender',
  ]);
  if (!access) return null;

  const since = new Date(
    now - CORRESPONDENT_WINDOW_DAYS * DAY_MS
  ).toISOString();
  const [messages, trashed, blocks] = await Promise.all([
    loadRecentMessages(access, ctx, mailboxId, since),
    loadAllRows(
      () =>
        privateTable(access.admin, 'mail_message_user_state')
          .select('message_id')
          .eq('mailbox_id', mailboxId)
          .eq('user_id', ctx.user.id)
          .gte('trashed_at', since)
          .order('message_id'),
      'Failed to load trashed mail'
    ),
    loadSenderBlocks(access.admin, mailboxId),
  ]);
  const trashedIds = new Set(trashed.map((row) => row.message_id as string));
  const visible = messages.filter((row) => !trashedIds.has(row.id as string));
  const createdAt = new Map(
    visible.map((row) => [row.id as string, row.created_at as string])
  );

  const events: CorrespondentEvent[] = [];
  const outboundIds: string[] = [];
  for (const row of visible) {
    if (row.direction === 'outbound') {
      outboundIds.push(row.id as string);
    } else if (row.from_address) {
      events.push({
        email: row.from_address,
        name: row.from_name ?? null,
        at: row.created_at,
        direction: 'inbound',
      });
    }
  }
  for (const recipient of await loadOutboundRecipients(
    access.admin,
    outboundIds
  )) {
    const at = createdAt.get(recipient.message_id as string);
    if (!at || !recipient.address) continue;
    events.push({
      email: recipient.address,
      name: recipient.display_name ?? null,
      at,
      direction: 'outbound',
    });
  }

  return rankCorrespondents(
    events.filter(
      (event) => !isBlocked(event.email.trim().toLowerCase(), blocks)
    ),
    {
      now,
      query,
      limit,
      excludedAddresses: [access.mailbox.address],
    }
  );
}
