import type { Database } from '@tuturuuu/types/db';

type WorkspaceMemberType = Database['public']['Enums']['workspace_member_type'];

export interface Workspace {
  id: string;
  name: string;
  avatar_url?: string;
  logo_url?: string;
}

export interface SeatStatus {
  currentSeats: number;
  maxSeats: number | null;
  availableSeats: number | null;
  hasLimit: boolean;
}

export interface WorkspaceInfo {
  workspace: Workspace;
  memberCount: number;
  seatLimitReached?: boolean;
  seatStatus?: SeatStatus;
  /** Membership level for this invite link (MEMBER vs GUEST) */
  memberType?: WorkspaceMemberType;
}

export interface ValidateInviteResult {
  authenticated: boolean;
  alreadyMember?: boolean;
  workspace?: Workspace;
  workspaceInfo?: WorkspaceInfo;
  error?: string;
  errorCode?: string;
}
