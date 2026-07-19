import {
  createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatAttachment,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  attachmentId: string;
  conversationId: string;
  wsId: string;
};

export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      const externalConversation =
        params.conversationId.startsWith('ai-agent-thread-');
      const attachment = await callPrivateChatRpc<ChatAttachment>(
        externalConversation
          ? 'ai_agent_external_get_attachment'
          : 'chat_get_attachment',
        {
          p_actor_user_id: auth.user.id,
          p_attachment_id: params.attachmentId,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      const signedUrl = await createWorkspaceStorageSignedReadUrl(
        attachment.storageWsId ?? context.context.normalizedWsId,
        attachment.storagePath,
        {
          requireExists: true,
        }
      );

      return NextResponse.json({ signedUrl });
    } catch (error) {
      if (error instanceof WorkspaceStorageError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.status }
        );
      }

      return chatRpcErrorResponse(error, 'Failed to sign chat attachment');
    }
  },
  { allowAppSessionAuth: true }
);
