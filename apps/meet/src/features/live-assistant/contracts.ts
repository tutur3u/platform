import { z } from 'zod';

export const MEET_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const liveAudienceSchema = z.enum(['personal', 'room']);
export type LiveAudience = z.infer<typeof liveAudienceSchema>;
export const liveSessionClaimsSchema = z.object({
  audience: z.literal('meet-live'),
  sessionId: z.uuid(),
  meetingId: z.uuid(),
  ownerId: z.uuid(),
  billingWorkspaceId: z.uuid(),
  mode: liveAudienceSchema,
  expiresAt: z.number().int().positive(),
});
export type LiveSessionClaims = z.infer<typeof liveSessionClaimsSchema>;
export const liveMemorySchema = z.object({
  id: z.uuid(),
  content: z.string().trim().min(1).max(1000),
  category: z.enum(['preference', 'fact', 'project']),
  created_at: z.string(),
});
export type LiveMemory = z.infer<typeof liveMemorySchema>;
export const liveClientCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('audio'), data: z.string().max(32_000) }),
  z.object({
    type: z.literal('text'),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({ type: z.literal('pause'), paused: z.boolean() }),
  z.object({
    type: z.literal('decision'),
    id: z.uuid(),
    approved: z.boolean(),
  }),
  z.object({ type: z.literal('stop') }),
]);
export type LiveClientCommand = z.infer<typeof liveClientCommandSchema>;
export type LiveAssistantEvent =
  | {
      type: 'state';
      state:
        | 'connecting'
        | 'listening'
        | 'paused'
        | 'recovering'
        | 'ended'
        | 'error';
      detail?: string;
    }
  | { type: 'audio'; data: string; sampleRate: number }
  | {
      type: 'transcript';
      role: 'user' | 'assistant';
      text: string;
      finished?: boolean;
    }
  | {
      type: 'review';
      id: string;
      action: 'share' | 'remember' | 'workspace';
      text: string;
      status: 'pending' | 'processing' | 'approved' | 'denied' | 'failed';
    }
  | {
      type: 'context';
      checkpoints: number;
      retainedTurns: number;
      compressed: boolean;
    }
  | { type: 'usage'; costUsd: number; incomplete: boolean }
  | { type: 'interrupt' };
