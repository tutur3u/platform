import {
  type MeetAiParams,
  meetAiResponse,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import {
  readMeetConsentRoster,
  recordMeetConsent,
} from '@tuturuuu/meet-core/features/meeting-ai/server/consent';

export async function GET(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => readMeetConsentRoster(request, params));
}

export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => recordMeetConsent(request, params));
}
