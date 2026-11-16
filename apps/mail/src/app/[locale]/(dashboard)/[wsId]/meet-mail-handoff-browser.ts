import {
  HANDOFF_WINDOW_MS,
  type MeetMailHandoff,
} from '@tuturuuu/utils/meet-mail-handoff';
import { z } from 'zod';
const receiptSchema = z
  .array(z.object({ id: z.uuidv4(), until: z.number().int() }).strict())
  .max(128);
const storageKey = 'mail-meet-handoff-receipts-v1';
/** Only random IDs and expiry timestamps are persisted; draft plaintext stays transient. */
export async function claimMeetMailHandoff(value: MeetMailHandoff) {
  if (!navigator.locks) throw new Error('Replay protection unavailable');
  return navigator.locks.request(storageKey, () => {
    const now = Date.now();
    if (
      now - value.issuedAt > HANDOFF_WINDOW_MS ||
      value.issuedAt > now + 30_000
    )
      return false;
    const receipts = receiptSchema
      .parse(JSON.parse(localStorage.getItem(storageKey) ?? '[]'))
      .filter((entry) => entry.until >= now);
    if (receipts.some(({ id }) => id === value.id) || receipts.length >= 128)
      return false;
    localStorage.setItem(
      storageKey,
      JSON.stringify([
        ...receipts,
        { id: value.id, until: value.issuedAt + HANDOFF_WINDOW_MS + 30_000 },
      ])
    );
    return true;
  });
}
