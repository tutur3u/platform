import type { MailThreadSummary } from '@tuturuuu/internal-api';

const WINDOW_MS = 10 * 60 * 1000;

/** Presentation only: these are similar deliveries, never deduplicated records. */
export function groupMailDeliveries(threads: MailThreadSummary[]) {
  const groups: MailThreadSummary[][] = [];
  const candidates = new Map<string, MailThreadSummary[][]>();
  for (const thread of threads) {
    const timestamp = Date.parse(thread.lastMessageAt ?? '');
    const recipient = thread.deliveryRecipient?.trim().toLowerCase();
    const sender = thread.participants[0]?.address?.trim().toLowerCase();
    const eligible =
      recipient &&
      sender &&
      thread.messageCount === 1 &&
      thread.participants.length === 1 &&
      thread.latestSnippet?.trim() &&
      thread.subject.trim() &&
      Number.isFinite(timestamp);
    if (!eligible) {
      groups.push([thread]);
      continue;
    }
    const key = JSON.stringify([
      thread.mailboxId,
      sender,
      thread.subject.trim(),
      thread.latestSnippet?.trim(),
      thread.hasAttachments,
    ]);
    const matches = candidates.get(key) ?? [];
    const group = matches.find(
      (items) =>
        Math.abs(timestamp - Date.parse(items[0]!.lastMessageAt!)) <=
          WINDOW_MS &&
        !items.some(
          (item) => item.deliveryRecipient?.trim().toLowerCase() === recipient
        )
    );
    if (group) group.push(thread);
    else {
      const next = [thread];
      groups.push(next);
      matches.push(next);
      candidates.set(key, matches);
    }
  }
  return groups;
}
