import 'server-only';
import { MIRA_ROOM_CONSENT_REQUIRED } from '@tuturuuu/realtime/meet';
import { MeetCallAccessError } from '../../call/lib/call-access';
import {
  callRoomService,
  type MeetCallRouteAccess,
  type SignedInMeetCallAccess,
} from '../../call/server/room-service';
import {
  isMeetAiEnabledForWorkspace,
  meetAiGateEnv,
} from '../../meeting-ai/server/workspace-gate';
import { miraBillingWorkspaceId } from '../mira-entitlement';
import { hasMiraAdultAttestation } from '../participant-consent';
import { readMiraDemoAuthority } from './demo-authority';
import { readMiraAdultAttestation } from './mira-attestation';

type MiraEnv = {
  MEET_AI_DISABLED?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
};

async function attested(workspaceId: string) {
  return hasMiraAdultAttestation({
    workspaceId,
    attestation: await readMiraAdultAttestation(workspaceId),
  });
}

/**
 * Room Mira (room chat @mira) authority for the requester. Same account rule
 * and workspace gate as Private Mira, but room content always needs the
 * meeting workspace's stored 18+ attestation; there is no Personal-workspace
 * exception because other participants are present. Staff drain the root
 * workspace; paid accounts charge the meeting workspace.
 */
export async function requireRoomMiraAuthority(access: SignedInMeetCallAccess) {
  const env = (await meetAiGateEnv()) as MiraEnv | undefined;
  const workspaceId = access.meeting.ws_id;
  const authority = await readMiraDemoAuthority({
    accountId: access.user.id,
    workspaceId,
    meetingId: access.meeting.id,
    workspaceMember: access.canReadWorkspace,
    admitted: true,
    disabledBinding: env?.MEET_AI_DISABLED,
  });
  if (!authority.allowed)
    throw new MeetCallAccessError(
      403,
      'Room Mira is unavailable',
      authority.reason === 'disabled'
        ? 'MIRA_DEPLOYMENT_DISABLED'
        : authority.reason === 'workspace'
          ? 'MIRA_WORKSPACE_UNAVAILABLE'
          : 'MIRA_ACCOUNT_UNAVAILABLE'
    );
  if (!(await attested(workspaceId)))
    throw new MeetCallAccessError(
      403,
      'Room Mira needs the workspace 18+ setting',
      'MIRA_WORKSPACE_UNAVAILABLE'
    );
  if (!env?.GOOGLE_GENERATIVE_AI_API_KEY)
    throw new MeetCallAccessError(
      503,
      'Room Mira provider is unavailable',
      'MIRA_PROVIDER_UNAVAILABLE'
    );
  return {
    payer: authority.payer,
    billingWorkspaceId: miraBillingWorkspaceId(authority.payer, workspaceId),
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
}

/** Throws unless every admitted participant currently allows room Mira. */
export async function requireRoomMiraFence(access: SignedInMeetCallAccess) {
  const read = await callRoomService<{ fence?: { ready?: boolean } }>(access, {
    action: 'mira.room.read',
  });
  if (read.fence?.ready !== true)
    throw new MeetCallAccessError(
      409,
      MIRA_ROOM_CONSENT_REQUIRED,
      'MIRA_ROOM_CONSENT_REQUIRED'
    );
}

/**
 * Immediately before the provider receives room content: every admitted
 * participant still allows room Mira and every source account of this request
 * keeps the exact consent revision it was reserved with.
 */
export async function requireRoomMiraDispatch(
  access: SignedInMeetCallAccess,
  messageId: string
) {
  try {
    await callRoomService(access, { action: 'mira.room.verify', messageId });
  } catch {
    throw new MeetCallAccessError(
      409,
      MIRA_ROOM_CONSENT_REQUIRED,
      'MIRA_ROOM_CONSENT_REQUIRED'
    );
  }
}

/**
 * Provider fetch for room Mira generation. Every outbound provider request
 * (each model step and the model-backed web search) first re-verifies the
 * all-participant fence and the request's exact source consent, so a
 * withdrawal between steps stops the next request before it leaves.
 * `withdrawn()` returns the consent error when a check refused a request;
 * `sent()` tells whether any request reached the provider.
 */
export function roomMiraProviderFetch(
  access: SignedInMeetCallAccess,
  messageId: string,
  upstream: typeof fetch = fetch
) {
  let refused: MeetCallAccessError | undefined;
  let sent = false;
  const guarded = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      await requireRoomMiraDispatch(access, messageId);
    } catch (error) {
      refused = error as MeetCallAccessError;
      throw error;
    }
    sent = true;
    return upstream(input, init);
  }) as typeof fetch;
  return { fetch: guarded, withdrawn: () => refused, sent: () => sent };
}

/**
 * Whether room Mira could run in this meeting at all, independent of the
 * viewer's own plan: deployment on, workspace gate open, workspace attested
 * and a provider configured. Participants are asked to choose only then.
 */
export async function readRoomMiraAvailability(access: MeetCallRouteAccess) {
  try {
    const env = (await meetAiGateEnv()) as MiraEnv | undefined;
    const workspaceId = access.meeting.ws_id;
    return (
      (env?.MEET_AI_DISABLED === 'false' || env?.MEET_AI_DISABLED === '0') &&
      !!env.GOOGLE_GENERATIVE_AI_API_KEY &&
      isMeetAiEnabledForWorkspace(workspaceId, env) &&
      (await attested(workspaceId))
    );
  } catch {
    return false;
  }
}
