import 'server-only';
import { meetAiUsageGuard } from '../../meeting-ai/server/usage-limit';
import type { MeetGuestJoinLimiter } from '../lib/guest-rate-limit';

/** The shared abuse-guard client when Meet runs with its Durable Object. */
export async function meetGuestWhiteboardLimiter(): Promise<MeetGuestJoinLimiter | null> {
  try {
    const { selection } = await meetAiUsageGuard();
    return selection.kind === 'durable-object' ? selection.client : null;
  } catch {
    return null;
  }
}
