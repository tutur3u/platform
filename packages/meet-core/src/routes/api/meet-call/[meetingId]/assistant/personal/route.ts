import { getCloudflareContext } from '@opennextjs/cloudflare';
import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { z } from 'zod';
import { readPersonalChatBody } from '../../../../../../features/call/server/personal-chat-body';
import { readMiraDemoAuthority } from '../../../../../../features/live-assistant/server/demo-authority';
import { requirePrivateMiraChoice } from '../../../../../../features/live-assistant/server/private-consent';

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const cloudflare = await getCloudflareContext({ async: true }).catch(
      () => null
    );
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
    const consent = await requirePrivateMiraChoice(access);
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

    const payload = input.parse(await readPersonalChatBody(request));
    async function checkConsent() {
      const current = await requirePrivateMiraChoice(access);
      if (current.revision !== consent.revision)
        throw new MeetCallAccessError(
          403,
          'Private Mira choice changed',
          'MIRA_CONSENT_REQUIRED'
        );
    }
    const { requestPersonalMeetChat } =
      await import('../../../../../../features/call/server/personal-chat-request');
    const answer = await requestPersonalMeetChat(access, payload, {
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      checkConsent,
    });
    await checkConsent();
    return answer;
  });
}
