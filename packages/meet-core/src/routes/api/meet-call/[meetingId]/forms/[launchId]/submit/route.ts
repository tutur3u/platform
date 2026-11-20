import { z } from 'zod';
import { MAX_FORM_BODY_BYTES } from '../../../../../../../features/call/server/forms/definition';
import { readFormBody } from '../../../../../../../features/call/server/forms/request';
import {
  submitFormRequestSchema,
  submitMeetForm,
} from '../../../../../../../features/call/server/forms/submit';
import { meetFormsRoute } from '../../../../../../../features/call/server/forms/route-guard';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string; launchId: string }> }
) {
  const { meetingId, launchId } = await params;
  return meetFormsRoute(request, meetingId, async (access) => {
    const body = submitFormRequestSchema.parse(
      await readFormBody(request, MAX_FORM_BODY_BYTES)
    );
    return submitMeetForm(access, z.uuid().parse(launchId), body, request);
  });
}
