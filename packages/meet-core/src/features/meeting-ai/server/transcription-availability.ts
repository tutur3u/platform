import 'server-only';
import { MEETING_APP } from '../../../runtime';
import { hasMiraAdultAttestation } from '../../live-assistant/participant-consent';
import { readMiraAdultAttestation } from '../../live-assistant/server/mira-attestation';
import { isMeetAiEnabledForWorkspace, meetAiGateEnv } from './workspace-gate';

/** Why the meeting transcript and notes cannot run; shown to the viewer. */
export type MeetTranscriptUnavailableReason =
  /** A Tuturuuu deployment or security switch keeps it off everywhere. */
  | 'disabled'
  /** The workspace is protected, denylisted or not admitted by the gate. */
  | 'workspace'
  /** The workspace owner has not confirmed the 18+ audience setting. */
  | 'audience'
  /** The availability check itself failed; retrying can help. */
  | 'error';

export type MeetTranscriptAvailability =
  | { available: true }
  | { available: false; reason: MeetTranscriptUnavailableReason };

/**
 * Whether room-wide transcription and notes may run for a meeting workspace.
 * In order: the kill switch, the full Meet AI workspace gate (protected ids,
 * denylist, then the reviewed MEET_AI_ALL_WORKSPACES opt-in or the
 * allowlist) and the workspace's stored 18+ audience attestation. The host's
 * account rule and payer, and each participant's own choice, are separate
 * checks on every paid request. Parley stays off.
 */
export async function readMeetTranscriptionAvailability(
  wsId: string
): Promise<MeetTranscriptAvailability> {
  if (MEETING_APP !== 'meet') return { available: false, reason: 'disabled' };
  try {
    const env = await meetAiGateEnv();
    const disabled = env ? Reflect.get(env, 'MEET_AI_DISABLED') : undefined;
    if (disabled !== 'false' && disabled !== '0')
      return { available: false, reason: 'disabled' };
    if (!isMeetAiEnabledForWorkspace(wsId, env))
      return { available: false, reason: 'workspace' };
    const attested = hasMiraAdultAttestation({
      workspaceId: wsId,
      attestation: await readMiraAdultAttestation(wsId),
    });
    if (!attested) return { available: false, reason: 'audience' };
    return { available: true };
  } catch {
    return { available: false, reason: 'error' };
  }
}
