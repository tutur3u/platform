import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export type ChatConversationType = 'ai' | 'channel' | 'direct' | 'group';
export type ChatMessageKind = 'assistant' | 'system' | 'user';

export interface ChatUserProfile {
  avatarUrl: string | null;
  displayName: string;
  handle: string | null;
  id: string;
}

export type ChatFriendRequestStatus = 'accepted' | 'declined' | 'pending';

export interface ChatFriendRequest {
  createdAt: string;
  id: string;
  recipient: ChatUserProfile;
  recipientUserId: string;
  requester: ChatUserProfile;
  requesterUserId: string;
  respondedAt: string | null;
  status: ChatFriendRequestStatus;
  updatedAt: string;
}

export interface ChatFriendRequests {
  accepted: ChatFriendRequest[];
  incoming: ChatFriendRequest[];
  outgoing: ChatFriendRequest[];
}

export interface ChatConversationMember {
  archivedAt: string | null;
  conversationId: string;
  id: string;
  joinedAt: string;
  lastReadAt: string | null;
  mutedAt: string | null;
  pinnedAt: string | null;
  role: 'admin' | 'assistant' | 'member' | 'owner';
  user: ChatUserProfile;
  userId: string;
}

export interface ChatAttachment {
  contentType: string | null;
  conversationId: string;
  createdAt: string;
  filename: string;
  fullPath: string | null;
  id: string;
  messageId: string | null;
  sizeBytes: number | null;
  storageWsId: string | null;
  storagePath: string;
  uploaderId: string | null;
}

export interface ChatReactionSummary {
  count: number;
  emoji: string;
  userIds: string[];
}

export interface ChatMessage {
  attachments: ChatAttachment[];
  content: string;
  conversationId: string;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  kind: ChatMessageKind;
  metadata: Record<string, unknown>;
  reactions: ChatReactionSummary[];
  replyToMessageId: string | null;
  sender: ChatUserProfile | null;
  senderId: string | null;
  updatedAt: string | null;
}

export interface ChatConversation {
  aiEnabled: boolean;
  archivedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  description: string | null;
  id: string;
  latestMessage: ChatMessage | null;
  memberCount: number;
  members: ChatConversationMember[];
  metadata: Record<string, unknown>;
  title: string | null;
  type: ChatConversationType;
  unreadCount: number;
  updatedAt: string;
  wsId: string;
}

export interface ChatConversationDeleteResult {
  conversationId: string;
  mode: 'archived' | 'left';
  type: ChatConversationType;
}

export interface ChatPreparedAttachment {
  conversationId: string;
  maxSizeBytes: number;
  pathPrefix: string;
  storageWsId: string;
}

export interface ChatRouteContext {
  normalizedWsId: string;
  permissions: NonNullable<Awaited<ReturnType<typeof getPermissions>>>;
  supabase: TypedSupabaseClient;
  user: SessionAuthContext['user'];
}

type PrivateRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

function getPrivateRpcClient(sbAdmin: unknown) {
  return (
    typeof sbAdmin === 'object' && sbAdmin !== null && 'schema' in sbAdmin
      ? (
          sbAdmin as unknown as {
            schema: (schema: 'private') => PrivateRpcClient;
          }
        ).schema('private')
      : sbAdmin
  ) as PrivateRpcClient;
}

export async function callPrivateChatRpc<T>(
  fn: string,
  args?: Record<string, unknown>
) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await getPrivateRpcClient(sbAdmin).rpc(fn, args);

  if (error) {
    throw error;
  }

  return data as T;
}

export function getChatRpcErrorStatus(error: unknown) {
  const rpcError = error as { code?: string; message?: string };
  const message = rpcError.message ?? '';

  if (
    rpcError.code === '42501' ||
    /forbidden|permission|required/u.test(message)
  ) {
    return 403;
  }

  if (/not_found|not found/u.test(message)) {
    return 404;
  }

  if (
    rpcError.code === '22023' ||
    /invalid|empty|too_large|requires|target/u.test(message)
  ) {
    return 400;
  }

  return 500;
}

export function chatRpcErrorResponse(error: unknown, fallback: string) {
  const status = getChatRpcErrorStatus(error);
  const rpcError = error as { code?: string; message?: string };

  if (status >= 500) {
    serverLogger.error(fallback, error);
  }

  return NextResponse.json(
    {
      code: rpcError.code,
      message: status >= 500 ? fallback : rpcError.message || fallback,
    },
    { status }
  );
}

export async function resolveChatRouteContext({
  auth,
  permission = 'view_chat',
  wsId,
}: {
  auth: SessionAuthContext;
  permission?: PermissionId;
  wsId: string;
}): Promise<
  | {
      ok: true;
      context: ChatRouteContext;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const normalizedWsId = await normalizeWorkspaceId(wsId, auth.supabase);
  const permissions = await getPermissions({
    user: auth.user,
    wsId: normalizedWsId,
  });

  if (!permissions) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (permissions.withoutPermission(permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Insufficient chat permissions' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      normalizedWsId,
      permissions,
      supabase: auth.supabase,
      user: auth.user,
    },
  };
}

export function toLegacyChannel(conversation: ChatConversation) {
  return {
    id: conversation.id,
    ws_id: conversation.wsId,
    name: conversation.title ?? getConversationFallbackTitle(conversation),
    description: conversation.description,
    is_private: conversation.type !== 'channel',
    created_at: conversation.createdAt,
    created_by: conversation.createdBy,
    updated_at: conversation.updatedAt,
  };
}

export function toLegacyMessage(message: ChatMessage) {
  return {
    id: message.id,
    channel_id: message.conversationId,
    user_id: message.senderId ?? '',
    content: message.content,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
    deleted_at: message.deletedAt,
  };
}

function getConversationFallbackTitle(conversation: ChatConversation) {
  const firstOtherMember = conversation.members.find(
    (member) => member.userId !== conversation.createdBy
  );

  if (conversation.type === 'direct' && firstOtherMember) {
    return firstOtherMember.user.displayName;
  }

  if (conversation.type === 'ai') {
    return 'Mira';
  }

  return 'Untitled chat';
}
