import {
  isMeetAiEnabledForWorkspace,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';

/**
 * Private Live eligibility for a saved session: the kill switch, the full Meet
 * AI workspace gate (protected ids, denylist, reviewed opt-in or allowlist) and
 * the signed private grant. The session rechecks it on every client turn and
 * every 20-second tick, and stops (settling billing) when it fails.
 */

export function liveWorkspaceAllowed(
  env: MeetAiGateEnv,
  session:
    | {
        claims: {
          mode?: string;
          inputSource?: string;
          consentVersion?: string;
          consentRevision?: number;
          workspaceAuthority?: string;
        };
        identity: { workspaceId?: string | null };
      }
    | undefined
) {
  if (!env || !session) return false;
  const disabled = Reflect.get(env, 'MEET_AI_DISABLED');
  return (
    (disabled === 'false' || disabled === '0') &&
    isMeetAiEnabledForWorkspace(session.identity.workspaceId, env) &&
    session.claims.mode === 'personal' &&
    session.claims.inputSource === 'private-microphone' &&
    !!session.identity.workspaceId &&
    !!session.claims.consentVersion &&
    Number.isSafeInteger(session.claims.consentRevision) &&
    (session.claims.consentRevision ?? 0) > 0 &&
    ['verified-personal', 'workspace-admin'].includes(
      session.claims.workspaceAuthority ?? ''
    )
  );
}
