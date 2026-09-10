import 'server-only';
import { MeetCallAccessError } from '../lib/call-access';
import { answerPersonalMeetChat } from './personal-assistant';
import { callRoomService } from './room-service';

type Access = Parameters<typeof callRoomService>[0];
type Input = Parameters<typeof answerPersonalMeetChat>[1] & {
  requestId: string;
  startedAt: number;
};
export async function requestPersonalMeetChat(access: Access, input: Input) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(input))
  );
  const fingerprint = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  const receipt = await callRoomService<{ started?: boolean; text?: string }>(
    access,
    {
      action: 'personal.begin',
      id: input.requestId,
      startedAt: input.startedAt,
      fingerprint,
    }
  );
  if (typeof receipt.text === 'string') return { text: receipt.text };
  if (!receipt.started)
    throw new MeetCallAccessError(409, 'Request already attempted');
  const answer = await answerPersonalMeetChat(access.user.id, input);
  // Persist the result before responding; a lost response can replay it without generation or billing.
  await callRoomService(access, {
    action: 'personal.finish',
    id: input.requestId,
    text: answer.text,
  });
  return answer;
}
