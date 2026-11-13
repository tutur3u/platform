import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import type { LiveContextJournal } from '../../features/live-assistant/context';
import type { LiveSessionClaims } from '../../features/live-assistant/contracts';
import type { LiveBillingState } from './billing';
import { type LiveProposal, proposalSchema } from './reviews';
import type { LiveRoomIdentity } from './room';

export type SavedSession = {
  claims: LiveSessionClaims;
  identity: LiveRoomIdentity;
  timezone: string;
  voice?: string;
  sharedContext: string;
  scenarioInstructions?: string;
  workspace?: {
    id: string;
    tools: import('@google/genai/web').FunctionDeclaration[];
  };
  journal: LiveContextJournal;
  handle?: string;
  toolResponses?: import('./tool-responses').LiveToolResponse[];
  billing?: LiveBillingState;
  billingFinalized?: boolean;
  coverageGap?: boolean;
  pendingUsage?: boolean;
  searchTurn?: { queries: string[]; counted: number };
  publicBillings?: Record<string, LiveBillingState>;
  ended?: boolean;
  /** Absolute reconnect cutoff; resets and early alarms must not extend it. */
  disconnectedRecoveryDeadline?: number;
  registryRemoved?: boolean;
  roomReleased?: boolean;
  contextErased?: boolean;
  startedAt: number;
  registryUpdatedAt?: number;
  reviews: LiveProposal[];
};
export const checkpointSchema = z.object({
  summary: z.string().max(8000),
  decisions: z.array(z.string().max(500)).max(30),
  openQuestions: z.array(z.string().max(500)).max(30),
});

export function normalizeSavedLiveSession(saved: SavedSession | undefined) {
  if (!saved) return;
  saved.reviews = (Array.isArray(saved.reviews) ? saved.reviews : []).flatMap(
    (review) => {
      const parsed = proposalSchema.safeParse(review);
      return parsed.success ? [parsed.data] : [];
    }
  );
  if (!saved.ended && saved.billing) {
    saved.coverageGap = true;
    saved.billing.incomplete = true;
  }
}

/** Persist before arming so an early alarm or process replacement keeps the cutoff. */
export async function armLiveRecovery(
  saved: SavedSession,
  storage: DurableObjectStorage
) {
  if (saved.ended) return;
  saved.disconnectedRecoveryDeadline ??= Date.now() + 30_000;
  await storage.put('session', saved);
  await storage.setAlarm(saved.disconnectedRecoveryDeadline);
}

export function liveRecoveryExpired(saved: SavedSession, now = Date.now()) {
  return (
    saved.disconnectedRecoveryDeadline !== undefined &&
    now >= saved.disconnectedRecoveryDeadline
  );
}
