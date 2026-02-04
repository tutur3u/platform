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
}

export interface ValidateInviteResult {
  authenticated: boolean;
  alreadyMember?: boolean;
  workspace?: Workspace;
  workspaceInfo?: WorkspaceInfo;
  error?: string;
  errorCode?: string;
}
