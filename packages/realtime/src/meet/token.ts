import type { z } from 'zod';
import { signRealtimePayload, verifyRealtimePayload } from '../core/token';
import { meetRealtimeTokenPayloadSchema } from './index';

type MeetRealtimeTokenPayloadInput = z.input<
  typeof meetRealtimeTokenPayloadSchema
>;

export function signMeetRealtimeToken(
  payload: MeetRealtimeTokenPayloadInput,
  secret?: string
) {
  const parsed = meetRealtimeTokenPayloadSchema.parse(payload);
  return signRealtimePayload(parsed, secret);
}

export function verifyMeetRealtimeToken(
  token: string,
  secret?: string,
  nowMs = Date.now()
) {
  try {
    const payload = meetRealtimeTokenPayloadSchema.safeParse(
      verifyRealtimePayload(token, secret)
    );

    if (!payload.success || payload.data.exp * 1000 <= nowMs) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}
