import type { MeetRealtimeTokenPayload } from '../../../packages/realtime/src/meet';
import {
  type PersonalChatReceipts,
  personalChatReceipt,
  personalChatReceiptCommand,
} from '../../../packages/realtime/src/meet/personal-chat-receipts';

/** Keep private retry data out of the snapshot rewritten by room/media events. */
export async function personalReceiptStorage(
  storage: DurableObjectStorage,
  token: MeetRealtimeTokenPayload,
  input: unknown
): Promise<Response | undefined> {
  const parsed = personalChatReceiptCommand.safeParse(input);
  if (!parsed.success) return;
  if (!token.scopes.includes('meet:server'))
    return new Response('Forbidden', { status: 403 });
  const accountId = token.accountId ?? token.userId;
  const key = `personal-receipts:${accountId}`;
  return storage.transaction(async (transaction) => {
    const own = await transaction.get<PersonalChatReceipts[string]>(key);
    const result = personalChatReceipt(
      own ? { [accountId]: own } : undefined,
      accountId,
      parsed.data
    );
    await transaction.put(key, result.receipts[accountId] ?? {});
    return Response.json(result.body, {
      status: result.status ?? 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });
}
