import { connection } from 'next/server';
import { MAX_FORM_BODY_BYTES } from '../../../../../features/call/server/forms/definition';
import {
  launchActionSchema,
  listFormLaunches,
  runFormLaunchAction,
} from '../../../../../features/call/server/forms/launches';
import { readFormBody } from '../../../../../features/call/server/forms/request';
import { meetFormsRoute } from '../../../../../features/call/server/forms/route-guard';

type Params = { params: Promise<{ meetingId: string }> };

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId } = await params;
  return meetFormsRoute(request, meetingId, listFormLaunches);
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return meetFormsRoute(request, meetingId, async (access) => {
    const body = await readFormBody(request, MAX_FORM_BODY_BYTES);
    return runFormLaunchAction(access, launchActionSchema.parse(body));
  });
}
