import { z } from 'zod';
import type {
  LiveAssistantEvent,
  LiveSessionClaims,
} from '../../src/features/live-assistant/contracts';
import { type LiveEnvironment, liveDatabase, readLiveMemory } from './storage';

export const proposalSchema = z.object({
  id: z.uuid(),
  callId: z.string(),
  name: z.enum(['remember', 'propose_room_reply', 'workspace_tool']),
  toolName: z.string().optional(),
  timezone: z.string().optional(),
  processingAt: z.number().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  text: z.string().trim().min(1).max(4000),
  category: z.enum(['preference', 'fact', 'project']).optional(),
  status: z.enum(['pending', 'processing', 'approved', 'denied', 'failed']),
  expiresAt: z.number(),
});
export type LiveProposal = z.infer<typeof proposalSchema>;
export async function approveLiveMemory(
  env: LiveEnvironment,
  claims: LiveSessionClaims,
  proposal: LiveProposal
) {
  if (claims.mode !== 'personal' || proposal.name !== 'remember')
    throw new Error('Forbidden');
  const memory = await readLiveMemory(env, claims);
  if (!memory.enabled) throw new Error('Memory is disabled');
  await liveDatabase(env, 'rpc/save_meet_ai_memory', {
    method: 'POST',
    body: {
      p_user_id: claims.ownerId,
      p_content: proposal.text.slice(0, 1000),
      p_category: proposal.category ?? 'preference',
    },
  });
}

export function liveReviewEvent(review: LiveProposal): LiveAssistantEvent {
  return {
    type: 'review',
    id: review.id,
    action:
      review.name === 'workspace_tool'
        ? 'workspace'
        : review.name === 'remember'
          ? 'remember'
          : 'share',
    toolName: review.toolName,
    timezone: review.timezone ?? 'UTC',
    args: review.args,
    text: review.text,
    status: review.status,
  };
}

/** Discarding an uncertain review never makes its underlying action retryable. */
export async function dismissFailedLiveReview(
  saved: import('./session-state').SavedSession,
  id: string,
  persist: () => Promise<void>
) {
  if (
    !saved.reviews.some(
      (review) => review.id === id && review.status === 'failed'
    )
  )
    return false;
  saved.reviews = saved.reviews.filter((review) => review.id !== id);
  await persist();
  return true;
}
