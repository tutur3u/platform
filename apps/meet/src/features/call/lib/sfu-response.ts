import type { CloudflareSfuSessionDescription } from '@tuturuuu/realtime/meet';

export type SfuSessionResponse = { sessionId?: string };
export type SfuTracksResponse = {
  errorCode?: string;
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: CloudflareSfuSessionDescription;
  tracks?: Array<{ mid?: string; trackName?: string; errorCode?: string }>;
};
