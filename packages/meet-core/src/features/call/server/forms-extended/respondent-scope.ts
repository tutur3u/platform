import 'server-only';
import { createHmac } from 'node:crypto';
import { MeetCallAccessError } from '../../lib/call-access';

export function deriveExtendedFormRespondentScope({
  wsId,
  formId,
  actorId,
}: {
  wsId: string;
  formId: string;
  actorId: string;
}) {
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET?.trim();
  if (!secret)
    throw new MeetCallAccessError(503, 'Form respondent access unavailable');

  return createHmac('sha256', secret)
    .update(
      JSON.stringify(['meet-extended-form-respondent', wsId, formId, actorId])
    )
    .digest('hex');
}
