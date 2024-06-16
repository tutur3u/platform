import { Tables } from '../supabase';

export type AIChat = Tables<'ai_chats'>;
export type AIPrompt = Tables<'workspace_ai_prompts'>;
export type WorkspaceDocument = Tables<'workspace_documents'>;
export type WorkspaceUserReport = Tables<'external_user_monthly_reports'> & {
  href?: string;
};
