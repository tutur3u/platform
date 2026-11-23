import {
  type MeetingRecordParams,
  meetingRecordResponse,
} from '@tuturuuu/meet-core/features/meeting-record/server/access';
import {
  addMeetingRecordItem,
  deleteMeetingRecordItem,
  readMeetingRecord,
  updateMeetingRecordItem,
} from '@tuturuuu/meet-core/features/meeting-record/server/record';
import { connection } from 'next/server';

export async function GET(request: Request, params: MeetingRecordParams) {
  await connection();
  return meetingRecordResponse(() => readMeetingRecord(request, params));
}
export async function POST(request: Request, params: MeetingRecordParams) {
  return meetingRecordResponse(() => addMeetingRecordItem(request, params));
}
export async function PATCH(request: Request, params: MeetingRecordParams) {
  return meetingRecordResponse(() => updateMeetingRecordItem(request, params));
}
export async function DELETE(request: Request, params: MeetingRecordParams) {
  return meetingRecordResponse(() => deleteMeetingRecordItem(request, params));
}
