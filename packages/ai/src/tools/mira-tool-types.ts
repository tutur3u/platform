import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { PermissionId } from '@tuturuuu/types';
import type { MiraWorkspaceContextState } from './workspace-context';

export interface MiraToolContext {
  userId: string;
  wsId: string;
  creditWsId?: string;
  workspaceContext?: MiraWorkspaceContextState;
  chatId?: string;
  supabase: TypedSupabaseClient;
  timezone?: string;
  requestHeaders?: Pick<Headers, 'get'>;
  executionState?: object;
  authorizeWorkspaceTools?: (
    wsId: string,
    permissions: PermissionId[]
  ) => Promise<boolean>;
  canReadUserGroupStorage?: (input: {
    groupId: string;
    storagePath: string;
    wsId: string;
  }) => boolean | Promise<boolean>;
}
