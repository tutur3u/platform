import { Database, Tables } from '../supabase';

export type AIChat = Tables<'ai_chats'>;
export type AIPrompt = Tables<'workspace_ai_prompts'>;
export type WorkspaceDocument = Tables<'workspace_documents'>;

export type PermissionId =
  Database['public']['Enums']['workspace_role_permission'];

export type WorkspaceRole = Tables<'workspace_roles'> & {
  permissions: {
    id: PermissionId;
    enabled: boolean;
  }[];
};

export type WorkspaceUserReport = Tables<'external_user_monthly_reports'> & {
  href?: string;
};
