import { readFormBody } from '../../../../../../features/call/server/forms/request';
import { launchPublishedForm } from '../../../../../../features/call/server/forms-extended/producer';
import { meetExtendedFormsRoute } from '../../../../../../features/call/server/forms-extended/route-guard';

type Params = { params: Promise<{ meetingId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return meetExtendedFormsRoute(request, meetingId, async (access) =>
    launchPublishedForm(access, await readFormBody(request, 1024))
  );
}
