import {
  isMeetAiEnabledForWorkspace,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';

/**
 * Live is transcription: the assistant's input and output audio is transcribed
 * and persisted. Eligibility uses the workspace the server resolved when the
 * session was initialized, against the Worker env binding. Parley sessions are a
 * separate product and stay outside the pilot gate.
 */
export function liveWorkspaceAllowed(
  env: MeetAiGateEnv,
  session:
    | {
        claims: { app?: string };
        identity: { workspaceId?: string | null };
      }
    | undefined
) {
  if (!session) return false;
  return (
    session.claims.app === 'parley' ||
    isMeetAiEnabledForWorkspace(session.identity.workspaceId, env)
  );
}
