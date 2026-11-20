import { connection } from 'next/server';
import { listLaunchableForms } from '../../../../../../features/call/server/forms/launches';
import { meetFormsRoute } from '../../../../../../features/call/server/forms/route-guard';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return meetFormsRoute(request, meetingId, listLaunchableForms);
}
