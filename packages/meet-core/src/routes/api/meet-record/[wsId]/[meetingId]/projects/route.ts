import {
  type MeetingRecordParams,
  meetingRecordResponse,
} from '@tuturuuu/meet-core/features/meeting-record/server/access';
import {
  linkMeetingProject,
  readMeetingProjects,
  unlinkMeetingProject,
} from '@tuturuuu/meet-core/features/meeting-record/server/project-links';
import { connection } from 'next/server';

export async function GET(request: Request, params: MeetingRecordParams) {
  await connection();
  return meetingRecordResponse(() => readMeetingProjects(request, params));
}
export async function POST(request: Request, params: MeetingRecordParams) {
  return meetingRecordResponse(() => linkMeetingProject(request, params));
}
export async function DELETE(request: Request, params: MeetingRecordParams) {
  return meetingRecordResponse(() => unlinkMeetingProject(request, params));
}
