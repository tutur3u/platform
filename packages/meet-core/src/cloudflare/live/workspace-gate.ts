import type { MeetAiGateEnv } from '@tuturuuu/realtime/meet';

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
