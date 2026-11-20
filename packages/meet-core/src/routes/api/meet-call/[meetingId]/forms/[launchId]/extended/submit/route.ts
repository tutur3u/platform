import { publishedFormIdSchema } from '../../../../../../../../features/call/server/forms-extended/forms-source';
import { readFormBody } from '../../../../../../../../features/call/server/forms/request';
import { submitPublishedMeetForm } from '../../../../../../../../features/call/server/forms-extended/submit';
import { meetExtendedFormsRoute } from '../../../../../../../../features/call/server/forms-extended/route-guard';

type Params = { params: Promise<{ meetingId: string; launchId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { meetingId, launchId } = await params;
  return meetExtendedFormsRoute(request, meetingId, async (access) =>
    submitPublishedMeetForm(
      access,
      publishedFormIdSchema.parse(launchId),
      await readFormBody(request, 256 * 1024),
      request
    )
  );
}
