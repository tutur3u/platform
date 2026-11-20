import { publishedFormIdSchema } from '../../../../../../../../features/call/server/forms-extended/forms-source';
import { uploadMeetFormAnswer } from '../../../../../../../../features/call/server/forms-extended/producer';
import { meetExtendedFormsRoute } from '../../../../../../../../features/call/server/forms-extended/route-guard';

type Params = { params: Promise<{ meetingId: string; launchId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { meetingId, launchId } = await params;
  return meetExtendedFormsRoute(request, meetingId, async (access) =>
    uploadMeetFormAnswer(access, publishedFormIdSchema.parse(launchId), request)
  );
}
