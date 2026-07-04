import type { WorkspaceUserGroupAttendanceStatus } from '@tuturuuu/internal-api';

export type AttendanceStatus = WorkspaceUserGroupAttendanceStatus;

export type AttendanceEntry = {
  note?: string;
  status: AttendanceStatus;
};

export type AttendanceMember = {
  archived?: boolean;
  archived_until?: string | null;
  avatar_url?: string | null;
  display_name?: string | null;
  email?: string | null;
  full_name?: string | null;
  id: string;
  isGuest?: boolean;
  note?: string | null;
  phone?: string | null;
  role?: string | null;
};

export type AttendanceSession = {
  endTimezone: string;
  endsAt: string;
  groupId: string;
  groupName: string | null;
  id: string;
  startTimezone: string;
  startsAt: string;
  tags: Array<{
    color: string | null;
    id: string;
    name: string;
  }>;
  title: string | null;
};

export type AttendanceMap = Record<string, AttendanceEntry>;

export type GroupAttendanceClientProps = {
  canUpdateAttendance: boolean;
  endingDate?: string | null;
  groupId: string;
  initialAttendance?: AttendanceMap;
  initialDate: string;
  initialMembers: AttendanceMember[];
  initialSessionId?: string | null;
  initialSessions: AttendanceSession[];
  initialShowManagers: boolean;
  startingDate?: string | null;
  wsId: string;
};
