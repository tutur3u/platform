import {
  type MeetingRecordParams,
  meetingRecordResponse,
} from '@tuturuuu/meet-core/features/meeting-record/server/access';
import {
  carryOverItems,
  readSinceLastTime,
} from '@tuturuuu/meet-core/features/meeting-record/server/since-last-time';
import { connection } from 'next/server';

export async function GET(request: Request, params: MeetingRecordParams) {
  await connection();
  return meetingRecordResponse(() => readSinceLastTime(request, params));
}
export async function POST(request: Request, params: MeetingRecordParams) {
  return meetingRecordResponse(() => carryOverItems(request, params));
}
