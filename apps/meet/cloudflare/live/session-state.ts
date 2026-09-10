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
  voice?: string;
  sharedContext: string;
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
