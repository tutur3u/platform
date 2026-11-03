import {
  isMeetAiEnabledForWorkspace,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';
import { evaluateWorkspaceAiPolicy } from '@tuturuuu/utils/workspace-ai-policy';
import { type LiveEnvironment, liveDatabase } from './storage';

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

export async function liveWorkspacePolicyAllowed(
  env: LiveEnvironment,
  session: Parameters<typeof liveWorkspaceAllowed>[1]
) {
  const wsId = session?.identity.workspaceId;
  if (!wsId || !/^[0-9a-f-]{36}$/i.test(wsId)) return false;
  try {
    const rows = await liveDatabase<Array<{ name: string; value: string }>>(
      env,
      `workspace_secrets?ws_id=eq.${wsId}&name=in.(AI_ENABLED,AI_EDUCATION_SCOPE,ENABLE_EDUCATION)&select=name,value`
    );
    if (
      !Array.isArray(rows) ||
      rows.some((row) => row.value === null) ||
      new Set(rows.map((row) => row.name)).size !== rows.length
    )
      return false;
    const value = (name: string) =>
      rows.find((row) => row.name === name)?.value;
    const education = value('ENABLE_EDUCATION');
    if (
      education !== undefined &&
      education !== 'true' &&
      education !== 'false'
    )
      return false;
    return evaluateWorkspaceAiPolicy(
      {
        enabled: value('AI_ENABLED'),
        education: education === 'true',
        scope: value('AI_EDUCATION_SCOPE'),
      },
      'learner-data'
    );
  } catch {
    return false;
  }
}
