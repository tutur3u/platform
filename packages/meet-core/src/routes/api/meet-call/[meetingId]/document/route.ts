import { getCloudflareContext } from '@opennextjs/cloudflare';
import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  joinMeetingDocument,
  meetingDocumentCommandSchema,
  readDocumentTabParam,
  readMeetingDocuments,
  runMeetingDocumentCommand,
} from '@tuturuuu/meet-core/features/call/server/documents';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { connection } from 'next/server';
import { readDocumentBody } from '../../../../../features/call/server/document-body';
import { readMiraDemoAuthority } from '../../../../../features/live-assistant/server/demo-authority';
import { requirePrivateMiraChoice } from '../../../../../features/live-assistant/server/private-consent';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  return roomRoute(request, (await params).meetingId, (access) =>
    new URL(request.url).searchParams.get('view') === 'tabs'
      ? readMeetingDocuments(access)
      : joinMeetingDocument(access, readDocumentTabParam(request))
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const body = await readDocumentBody(request);
    if (
      !body ||
      typeof body !== 'object' ||
      (body as { action?: unknown }).action !== 'assist'
    ) {
      const command = meetingDocumentCommandSchema.safeParse(body);
      if (!command.success)
        throw new MeetCallAccessError(400, 'Invalid document request');
      return runMeetingDocumentCommand(access, command.data);
    }
    const { meetingDocumentAssistSchema, assistMeetingDocument } =
      await import('../../../../../features/call/server/document-assist');
    const input = meetingDocumentAssistSchema.safeParse(body);
    if (!input.success)
      throw new MeetCallAccessError(400, 'Invalid Mira document request');
    const cloudflare = await getCloudflareContext({ async: true }).catch(
      () => null
    );
    const env = cloudflare?.env as
      | { MEET_AI_DISABLED?: string; GOOGLE_GENERATIVE_AI_API_KEY?: string }
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
    async function checkConsent() {
      const current = await requirePrivateMiraChoice(access);
      if (current.revision !== consent.revision)
        throw new MeetCallAccessError(
          403,
          'Private Mira choice changed',
          'MIRA_CONSENT_REQUIRED'
        );
    }
    // The assist flow rechecks consent after generation and the room verifies
    // this revision atomically with every room-visible write.
    return assistMeetingDocument(access, input.data, {
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      checkConsent,
      consentRevision: consent.revision,
      payer: authority.payer,
    });
  });
}
