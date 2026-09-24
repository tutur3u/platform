import { forwardMeetAssistant } from './forward';

type Params = { params: Promise<{ meetingId: string; wsId: string }> };

export async function POST(request: Request, { params }: Params) {
  return forwardMeetAssistant(request, await params, 'assistant');
}
