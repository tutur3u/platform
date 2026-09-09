import { z } from 'zod';
import type {
  LiveAssistantEvent,
  LiveSessionClaims,
} from '../../src/features/live-assistant/contracts';
import { type LiveEnvironment, liveDatabase, readLiveMemory } from './storage';

export const proposalSchema = z.object({
  id: z.uuid(),
  callId: z.string(),
  name: z.enum(['remember', 'propose_room_reply']),
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
    action: review.name === 'remember' ? 'remember' : 'share',
    text: review.text,
    status: review.status,
  };
}
