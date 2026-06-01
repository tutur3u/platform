import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { MiraWorkspaceContextState } from './workspace-context';

export interface MiraToolContext {
  userId: string;
  wsId: string;
  creditWsId?: string;
  workspaceContext?: MiraWorkspaceContextState;
  chatId?: string;
  supabase: TypedSupabaseClient;
  timezone?: string;
  canReadUserGroupStorage?: (input: {
    groupId: string;
    storagePath: string;
    wsId: string;
  }) => boolean | Promise<boolean>;
}
