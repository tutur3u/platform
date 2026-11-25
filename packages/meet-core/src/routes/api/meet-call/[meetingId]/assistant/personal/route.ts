import { getCloudflareContext } from '@opennextjs/cloudflare';
import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  roomRoute,
  roomServiceFailureAction,
  type SignedInMeetCallAccess,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import { z } from 'zod';
import { readPersonalChatBody } from '../../../../../../features/call/server/personal-chat-body';
import { readMiraDemoAuthority } from '../../../../../../features/live-assistant/server/demo-authority';
import {
  requirePrivateMiraChoice,
  requirePrivateMiraChoiceState,
} from '../../../../../../features/live-assistant/server/private-consent';
import { forwardSharedTutorChat } from '../../../../../../features/live-assistant/server/private-share';

const input = z.object({
  requestId: z.uuid(),
  startedAt: z.number().int(),
  question: z.string().trim().min(1).max(2000),
  timezone: z.string().min(1).max(100),
  history: z
    .array(
      z.object({
        body: z.string().max(2000),
        assistant: z.boolean(),
      })
    )
    .max(12),
});

/** Stable failure codes the Private Mira panel words in EN and VI. */
const PRIVATE_MIRA_ROOM_UNAVAILABLE = 'MIRA_PRIVATE_ROOM_UNAVAILABLE';
const PRIVATE_MIRA_FAILED = 'MIRA_PRIVATE_FAILED';

type Stage = { name: string };

/**
 * Private Mira never answers a bare generic 500: a failed room action is a
 * retryable 503 and any other server failure carries a stable code. Refusals
 * keep their own status and code. Only the stage, the room action and the
 * error class are logged, never the question, history or answer.
 */
function privateMiraFailure(error: unknown, stage: Stage) {
  // Refusals (the access gate, consent, authority) and invalid input keep
  // their own status before anything inspects the failure further.
  if (error instanceof MeetCallAccessError && error.status < 500) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError) return error;
  const action = roomServiceFailureAction(error);
  if (error instanceof MeetCallAccessError && error.code && !action)
    return error;
  console.error('Private Mira answer failed', {
    stage: stage.name,
    action,
    name: error instanceof Error ? error.name : 'unknown',
  });
  if (action)
    return new MeetCallAccessError(
      503,
      'Private Mira is temporarily unavailable. Please try again.',
      PRIVATE_MIRA_ROOM_UNAVAILABLE
    );
  return new MeetCallAccessError(
    error instanceof MeetCallAccessError ? error.status : 500,
    'Private Mira could not answer. Please try again.',
    PRIVATE_MIRA_FAILED,
    error instanceof MeetCallAccessError ? error.retryAfterSeconds : undefined
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const stage: Stage = { name: 'request' };
    try {
      return await answerPrivateMira(request, meetingId, access, stage);
    } catch (error) {
      throw privateMiraFailure(error, stage);
    }
  });
}

async function answerPrivateMira(
  request: Request,
  meetingId: string,
  access: SignedInMeetCallAccess,
  stage: Stage
) {
  const body = await readPersonalChatBody(request);
  if (
    body &&
    typeof body === 'object' &&
    ('audience' in body || 'body' in body)
  )
    throw new MeetCallAccessError(
      403,
      'Room AI chat is unavailable. Use Private Mira after choosing Continue.'
    );
  const payload = input.safeParse(body);
  if (!payload.success)
    throw new MeetCallAccessError(400, 'Invalid private Mira message');

  stage.name = 'bindings';
  // `await` first: a runtime whose `getCloudflareContext` answers without a
  // Promise must not turn every question into a TypeError.
  const cloudflare = await Promise.resolve()
    .then(() => getCloudflareContext({ async: true }))
    .catch(() => null);
  const env = cloudflare?.env as
    | {
        MEET_AI_DISABLED?: string;
        GOOGLE_GENERATIVE_AI_API_KEY?: string;
      }
    | undefined;
  if (env?.MEET_AI_DISABLED !== 'false' && env?.MEET_AI_DISABLED !== '0')
    throw new MeetCallAccessError(
      403,
      'Private Mira is disabled',
      'MIRA_DEPLOYMENT_DISABLED'
    );
  stage.name = 'consent';
  const consent = await requirePrivateMiraChoice(access);
  stage.name = 'authority';
  const authority = await readMiraDemoAuthority({
    accountId: access.user.id,
    workspaceId: access.meeting.ws_id,
    meetingId,
    workspaceMember: access.canReadWorkspace,
    admitted: true,
    disabledBinding: env.MEET_AI_DISABLED,
  });
  if (!authority.allowed)
    throw new MeetCallAccessError(
      403,
      'Private Mira is unavailable for this workspace or account',
      authority.reason === 'workspace'
        ? 'MIRA_WORKSPACE_UNAVAILABLE'
        : 'MIRA_ACCOUNT_UNAVAILABLE'
    );
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY)
    throw new MeetCallAccessError(
      503,
      'Private Mira provider is unavailable',
      'MIRA_PROVIDER_UNAVAILABLE'
    );

  // Read with every consent check, so the latest one decides the forward.
  const tutorShare: { on: boolean; at?: number } = { on: false };
  async function checkConsent() {
    const current = await requirePrivateMiraChoiceState(access);
    tutorShare.on = current.shared;
    tutorShare.at = current.sharedAt;
    if (current.choice.revision !== consent.revision)
      throw new MeetCallAccessError(
        403,
        'Private Mira choice changed',
        'MIRA_CONSENT_REQUIRED'
      );
  }
  stage.name = 'answer';
  const { requestPersonalMeetChat } =
    await import('../../../../../../features/call/server/personal-chat-request');
  const answer = await requestPersonalMeetChat(access, payload.data, {
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    checkConsent,
    payer: authority.payer,
  });
  stage.name = 'recheck';
  await checkConsent();
  // Only while the owner shares their tutor chat, and never on the answer's
  // path: the room keeps it only while the share still holds.
  if (tutorShare.on) {
    const forward = forwardSharedTutorChat(
      access,
      [
        ...payload.data.history,
        { body: payload.data.question, assistant: false },
        { body: answer.text, assistant: true },
      ],
      tutorShare.at
    );
    cloudflare?.ctx?.waitUntil(forward);
  }
  return answer;
}
