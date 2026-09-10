import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { EMPTY_LIVE_JOURNAL } from '../../src/features/live-assistant/context';
import type { SavedSession } from './session-state';

/** Conversation context is session-only. Approved memories live separately under owner RLS. */
export async function eraseEndedLiveContext(
  storage: DurableObjectStorage,
  saved: SavedSession,
  retry: () => Promise<void>
) {
  if (!saved.ended || saved.contextErased) return;
  saved.handle = undefined;
  saved.searchTurn = undefined;
  saved.toolResponses = [];
  saved.sharedContext = '';
  saved.journal = structuredClone(EMPTY_LIVE_JOURNAL);
  saved.reviews = [];
  // Persist the closed boundary before deleting archive pages; never remove billing receipts.
  await storage.put('session', saved);
  const page = await storage.list({ prefix: 'turn:', limit: 128 });
  if (page.size) await storage.delete([...page.keys()]);
  if (page.size === 128) {
    await retry();
    return;
  }
  await storage.delete('archive:sequence');
  saved.contextErased = true;
  await storage.put('session', saved);
}
