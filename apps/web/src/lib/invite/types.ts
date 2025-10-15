export interface Workspace {
  id: string;
  name: string;
  avatar_url?: string;
  logo_url?: string;
}

export interface WorkspaceInfo {
  workspace: Workspace;
  role: string;
  roleTitle: string;
  memberCount: number;
}

export interface ValidateInviteResult {
  authenticated: boolean;
  alreadyMember?: boolean;
  workspace?: Workspace;
  workspaceInfo?: WorkspaceInfo;
  error?: string;
  errorCode?: string;
}
