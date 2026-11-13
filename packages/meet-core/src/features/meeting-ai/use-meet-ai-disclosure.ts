import { meetAiDisclosure } from './ai-disclosure-state';

/** Projects existing observations; it neither fetches nor authorizes AI. */
export function useMeetAiDisclosure(
  ai: {
    data?: {
      available?: boolean;
      sessions: readonly { ended_at: string | null }[];
    };
    error: unknown;
  },
  state: { liveAssistant?: { sessionId: string } },
  canReadWorkspace: boolean
) {
  return {
    audience: canReadWorkspace ? ('member' as const) : ('guest' as const),
    disclosure: meetAiDisclosure({
      available: canReadWorkspace ? ai.data?.available : undefined,
      failed: !!ai.error,
      transcriptionActive:
        ai.data?.sessions.some((session) => !session.ended_at) ?? false,
      miraActive: !!state.liveAssistant,
    }),
  };
}
