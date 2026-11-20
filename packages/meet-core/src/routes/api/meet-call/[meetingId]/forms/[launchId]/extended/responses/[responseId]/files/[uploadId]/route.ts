import { MeetCallAccessError } from '../../../../../../../../../../../features/call/lib/call-access';
import { publishedFormIdSchema } from '../../../../../../../../../../../features/call/server/forms-extended/forms-source';
import { downloadExtendedFormResponseFile } from '../../../../../../../../../../../features/call/server/forms-extended/operations';
import { createExtendedFormsStore } from '../../../../../../../../../../../features/call/server/forms-extended/store';
import { meetExtendedFormsRoute } from '../../../../../../../../../../../features/call/server/forms-extended/route-guard';

type Params = {
  params: Promise<{
    meetingId: string;
    launchId: string;
    responseId: string;
    uploadId: string;
  }>;
};

export async function GET(request: Request, { params }: Params) {
  const { meetingId, launchId, responseId, uploadId } = await params;
  return meetExtendedFormsRoute(request, meetingId, async (access) => {
    const result = await downloadExtendedFormResponseFile(
      { meetingId: access.meeting.id, wsId: access.meeting.ws_id },
      {
        launchId: publishedFormIdSchema.parse(launchId),
        responseId: publishedFormIdSchema.parse(responseId),
        uploadId: publishedFormIdSchema.parse(uploadId),
      },
      await createExtendedFormsStore(access)
    );
    if (result.status === 'not_found')
      throw new MeetCallAccessError(404, 'Form file not found');
    return result.response;
  });
}
