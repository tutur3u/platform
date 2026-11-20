import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MeetCallAccessError } from '../../../../../../../features/call/lib/call-access';
import { publishedFormIdSchema } from '../../../../../../../features/call/server/forms-extended/forms-source';
import {
  readExtendedFormPublication,
  releaseExtendedFormQuiz,
} from '../../../../../../../features/call/server/forms-extended/operations';
import { deriveExtendedFormRespondentScope } from '../../../../../../../features/call/server/forms-extended/respondent-scope';
import { createExtendedFormsStore } from '../../../../../../../features/call/server/forms-extended/store';
import { meetExtendedFormsRoute } from '../../../../../../../features/call/server/forms-extended/route-guard';

import { readWorkspaceForm } from '../../../../../../../features/call/server/forms/policy';
import { extendedFormResponsePolicy } from '../../../../../../../features/call/server/forms-extended/submit';

type Params = { params: Promise<{ meetingId: string; launchId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { meetingId, launchId } = await params;
  return meetExtendedFormsRoute(request, meetingId, async (access) => {
    const parsedLaunch = publishedFormIdSchema.parse(launchId);
    const params = new URL(request.url).searchParams;
    const responseIds = params.getAll('responseId');
    if (responseIds.length > 1)
      throw new MeetCallAccessError(400, 'Invalid response identifier');
    const responseId = responseIds[0];
    const result = await readExtendedFormPublication(
      { meetingId: access.meeting.id, wsId: access.meeting.ws_id },
      parsedLaunch,
      await createExtendedFormsStore(access),
      responseId === undefined
        ? undefined
        : {
            responseId: publishedFormIdSchema.parse(responseId),
            resolveActorScope: ({ wsId, formId }) =>
              deriveExtendedFormRespondentScope({
                wsId,
                formId,
                actorId: access.user.id,
              }),
          }
    );
    if (result.status === 'closed')
      throw new MeetCallAccessError(410, 'Form is closed');
    if (result.status === 'not_found')
      throw new MeetCallAccessError(404, 'Form publication not found');
    const admin = await createAdminClient({ noCookie: true });
    const current = await readWorkspaceForm(
      admin,
      access.meeting.ws_id,
      result.publication.formId
    );
    const { policy, challenge } = extendedFormResponsePolicy(
      access.meeting,
      result.publication,
      current
    );
    return {
      ...result.publication,
      submissionPolicy: policy,
      turnstile: challenge,
    };
  });
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId, launchId } = await params;
  return meetExtendedFormsRoute(request, meetingId, async (access) => {
    const parsedLaunch = publishedFormIdSchema.parse(launchId);
    const result = await releaseExtendedFormQuiz(
      { meetingId: access.meeting.id, wsId: access.meeting.ws_id },
      parsedLaunch,
      await createExtendedFormsStore(access)
    );
    if (result.status === 'not_found')
      throw new MeetCallAccessError(404, 'Form publication not found');
    if (result.status === 'policy_denied')
      throw new MeetCallAccessError(409, 'Manual quiz release is disabled');
    return { score: result.score, answers: result.answers };
  });
}
