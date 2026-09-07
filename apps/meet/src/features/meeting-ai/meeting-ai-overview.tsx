'use client';

import { MeetingAiPanel } from './meeting-ai-panel';
import { useMeetingAi } from './use-meeting-ai';

export function MeetingAiOverview({
  wsId,
  meetingId,
}: {
  wsId: string;
  meetingId: string;
}) {
  const ai = useMeetingAi(wsId, meetingId);
  return <MeetingAiPanel ai={ai} />;
}
