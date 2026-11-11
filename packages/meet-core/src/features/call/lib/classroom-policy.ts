import 'server-only';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import {
  getClassroomParticipantCap as resolve,
  MeetClassroomPolicyError,
} from '@tuturuuu/utils/meet-classroom-policy';
import { MeetCallAccessError } from './call-access';
export async function getClassroomParticipantCap(
  meetingId: string,
  wsId: string
) {
  if (MEETING_APP !== 'meet') return undefined;
  try {
    return await resolve(meetingId, wsId);
  } catch (error) {
    if (error instanceof MeetClassroomPolicyError)
      throw new MeetCallAccessError(error.status, error.message);
    throw error;
  }
}
