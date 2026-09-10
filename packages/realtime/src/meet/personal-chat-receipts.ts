import { z } from 'zod';

export const personalChatReceiptCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('personal.begin'),
    id: z.uuid(),
    startedAt: z.number().int(),
    fingerprint: z.string().length(64),
  }),
  z.object({
    action: z.literal('personal.finish'),
    id: z.uuid(),
    text: z.string().max(16000).optional(),
  }),
]);
type Receipt = {
  startedAt: number;
  fingerprint: string;
  status: 'pending' | 'done' | 'failed';
  text?: string;
};
export type PersonalChatReceipts = Record<string, Record<string, Receipt>>;
export const PERSONAL_CHAT_RETRY_MS = 60 * 60_000;

/** Requester-only retry receipts. Never emitted as room chat or admin context. */
export function personalChatReceipt(
  current: PersonalChatReceipts | undefined,
  accountId: string,
  input: z.infer<typeof personalChatReceiptCommand>,
  now = Date.now()
) {
  const receipts: PersonalChatReceipts = {};
  for (const [account, entries] of Object.entries(current ?? {})) {
    const kept = Object.fromEntries(
      Object.entries(entries).filter(
        ([, r]) => r.startedAt + PERSONAL_CHAT_RETRY_MS > now
      )
    );
    if (Object.keys(kept).length) receipts[account] = kept;
  }
  const own = receipts[accountId] ?? {};
  const existing = own[input.id];
  const result = (body: unknown, status?: number) => ({
    receipts,
    body,
    status,
  });
  if (input.action === 'personal.begin') {
    if (
      input.startedAt > now + 5000 ||
      input.startedAt + PERSONAL_CHAT_RETRY_MS <= now
    )
      return result({ error: 'Request retry window expired' }, 410);
    if (existing) {
      if (existing.fingerprint !== input.fingerprint)
        return result({ error: 'Request changed' }, 409);
      return result(
        existing.status === 'done'
          ? { text: existing.text }
          : { error: 'Request already attempted' },
        existing.status === 'done' ? undefined : 409
      );
    }
    if (Object.keys(own).length >= 40)
      return result({ error: 'Personal request limit reached' }, 429);
    receipts[accountId] = {
      ...own,
      [input.id]: {
        startedAt: input.startedAt,
        fingerprint: input.fingerprint,
        status: 'pending',
      },
    };
    return result({ started: true });
  }
  if (!existing) return result({ error: 'Request unavailable' }, 409);
  if (existing.status !== 'pending') return result({ ok: true });
  receipts[accountId] = {
    ...own,
    [input.id]: {
      ...existing,
      status: input.text === undefined ? 'failed' : 'done',
      text: input.text,
    },
  };
  return result({ ok: true });
}
