import { z } from 'zod';
import {
  getFormPrefill,
  prefillRequestSchema,
} from '../../../../../../../features/call/server/forms/prefill';
import { readFormBody } from '../../../../../../../features/call/server/forms/request';
import { meetFormsRoute } from '../../../../../../../features/call/server/forms/route-guard';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string; launchId: string }> }
) {
  const { meetingId, launchId } = await params;
  return meetFormsRoute(request, meetingId, async (access) => {
    const body = prefillRequestSchema.parse(await readFormBody(request, 8192));
    return getFormPrefill(access, z.uuid().parse(launchId), body);
  });
}
