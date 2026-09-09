import { z } from 'zod';
import type { LiveContextJournal } from '../../src/features/live-assistant/context';
import type { LiveSessionClaims } from '../../src/features/live-assistant/contracts';
import type { LiveBillingState } from './billing';
import type { LiveProposal } from './reviews';
import type { LiveRoomIdentity } from './room';

export type SavedSession = {
  claims: LiveSessionClaims;
  identity: LiveRoomIdentity;
  timezone: string;
  sharedContext: string;
  journal: LiveContextJournal;
  handle?: string;
  billing?: LiveBillingState;
  billingFinalized?: boolean;
  coverageGap?: boolean;
  publicBillings?: Record<string, LiveBillingState>;
  ended?: boolean;
  startedAt: number;
  reviews: LiveProposal[];
};
export const checkpointSchema = z.object({
  summary: z.string().max(8000),
  decisions: z.array(z.string().max(500)).max(30),
  openQuestions: z.array(z.string().max(500)).max(30),
});
