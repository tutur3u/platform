import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatPreparedAttachment,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import {
  createWorkspaceStorageUploadPayload,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const uploadUrlSchema = z.object({
  contentType: z.string().trim().max(255).nullable().optional(),
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(0).max(104857600).optional(),
});

export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = uploadUrlSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sanitizedFilename = sanitizeFilename(parsed.data.filename);
    if (!sanitizedFilename) {
      return NextResponse.json(
        { message: 'Invalid filename' },
        { status: 400 }
      );
    }

    try {
      const prepared = await callPrivateChatRpc<ChatPreparedAttachment>(
        'chat_prepare_attachment',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_filename: sanitizedFilename,
          p_size_bytes: parsed.data.sizeBytes ?? null,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      const filenameWithSuffix = `${generateRandomUUID()}-${sanitizedFilename}`;
      const uploadPayload = await createWorkspaceStorageUploadPayload(
        context.context.normalizedWsId,
        filenameWithSuffix,
        {
          path: prepared.pathPrefix,
          size: parsed.data.sizeBytes,
          upsert: false,
        }
      );

      return NextResponse.json({
        attachment: {
          contentType: parsed.data.contentType ?? null,
          filename: sanitizedFilename,
          fullPath: uploadPayload.fullPath,
          path: uploadPayload.path,
          sizeBytes: parsed.data.sizeBytes ?? null,
        },
        headers: uploadPayload.headers,
        maxSizeBytes: prepared.maxSizeBytes,
        signedUrl: uploadPayload.signedUrl,
        token: uploadPayload.token,
      });
    } catch (error) {
      if (error instanceof WorkspaceStorageError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.status }
        );
      }

      return chatRpcErrorResponse(error, 'Failed to prepare chat attachment');
    }
  },
  { allowAppSessionAuth: true }
);
