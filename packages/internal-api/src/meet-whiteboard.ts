import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type MeetWhiteboardRole = 'edit' | 'view';
export type MeetWhiteboardGuestAccess = 'none' | 'view' | 'draw';
export interface MeetWhiteboardLink {
  boardId: string;
  title: string;
  role: MeetWhiteboardRole;
  /** Present only for people who can manage links. */
  guestAccess?: MeetWhiteboardGuestAccess;
}
export interface MeetWhiteboardList {
  canManage: boolean;
  links: MeetWhiteboardLink[];
  /** Workspace boards a manager can link; empty for everyone else. */
  available: { id: string; title: string }[];
}
export interface MeetWhiteboardJoin {
  endpoint: string;
  token: string;
  role: MeetWhiteboardRole;
  refreshSeconds: number;
  board: { id: string; title: string };
  user: { id: string; displayName: string };
}
export type MeetWhiteboardCommand =
  | { action: 'join'; boardId: string }
  | {
      action: 'link';
      boardId: string;
      guestAccess?: MeetWhiteboardGuestAccess;
    }
  | {
      action: 'create';
      title: string;
      guestAccess?: MeetWhiteboardGuestAccess;
    }
  | { action: 'unlink'; boardId: string }
  | {
      action: 'guest-access';
      boardId: string;
      guestAccess: MeetWhiteboardGuestAccess;
    };

function whiteboardPath(meetingId: string) {
  return `/api/meet-call/${encodePathSegment(meetingId)}/whiteboard`;
}
export function listMeetWhiteboards(
  meetingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetWhiteboardList>(
    whiteboardPath(meetingId),
    { cache: 'no-store' }
  );
}
export function joinMeetWhiteboard(
  meetingId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  return postMeetWhiteboard<MeetWhiteboardJoin>(
    meetingId,
    { action: 'join', boardId },
    options
  );
}
export function updateMeetWhiteboards(
  meetingId: string,
  command: Exclude<MeetWhiteboardCommand, { action: 'join' }>,
  options?: InternalApiClientOptions
) {
  return postMeetWhiteboard<{ boardId: string }>(meetingId, command, options);
}
function postMeetWhiteboard<T>(
  meetingId: string,
  command: MeetWhiteboardCommand,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<T>(whiteboardPath(meetingId), {
    method: 'POST',
    body: JSON.stringify(command),
    headers: { 'Content-Type': 'application/json' },
  });
}
