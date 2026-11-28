import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import {
  getAiChatId,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import { CHAT_REPORT_REASONS } from '@/lib/chat/safety';

type RouteParams = {
  wsId: string;
};

const reportSchema = z.discriminatedUnion('subjectType', [
  z.object({
    subjectType: z.literal('user'),
    reportedUserId: z.guid(),
    reason: z.enum(CHAT_REPORT_REASONS),
    details: z.string().trim().max(1000).optional(),
    alsoBlock: z.boolean().optional(),
  }),
  z.object({
    subjectType: z.literal('message'),
    conversationId: z.guid(),
    messageId: z.guid(),
    reason: z.enum(CHAT_REPORT_REASONS),
    details: z.string().trim().max(1000).optional(),
    alsoBlock: z.boolean().optional(),
  }),
  z.object({
    subjectType: z.literal('ai_response'),
    // A native conversation uuid, or a Mira chat id such as `ai-chat-<uuid>`.
    conversationId: z.string().trim().min(1).max(200),
    messageId: z.guid(),
    reason: z.enum(CHAT_REPORT_REASONS),
    details: z.string().trim().max(1000).optional(),
  }),
]);

type ReportResult = {
  duplicate?: boolean;
  reportId: string;
  reportedUserId?: string | null;
};

function isRateLimited(error: unknown) {
  const rpcError = error as { code?: string; message?: string };
  return (
    rpcError.code === '54000' ||
    (rpcError.message ?? '').includes('chat_report_rate_limited')
  );
}

// Records a user, message or Mira-response report for staff review. The SQL
// checks the reporter can see the reported content and snapshots it from the
// database, so a report never trusts client-supplied message text.
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

    const parsed = reportSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const body = parsed.data;
    let conversationId: string | null =
      'conversationId' in body ? body.conversationId : null;
    let aiChatId: string | null = null;
    if (conversationId && isAiChatConversationId(conversationId)) {
      aiChatId = getAiChatId(conversationId) ?? null;
      conversationId = null;
      if (!aiChatId || !z.guid().safeParse(aiChatId).success) {
        return NextResponse.json(
          { message: 'Invalid conversation' },
          { status: 400 }
        );
      }
    } else if (conversationId && !z.guid().safeParse(conversationId).success) {
      return NextResponse.json(
        { message: 'Invalid conversation' },
        { status: 400 }
      );
    }

    let result: ReportResult | null;
    try {
      result = await callPrivateChatRpc<ReportResult>(
        'chat_submit_content_report',
        {
          p_actor_user_id: auth.user.id,
          p_ai_chat_id: aiChatId,
          p_conversation_id: conversationId,
          p_details: body.details ?? null,
          p_message_id: 'messageId' in body ? body.messageId : null,
          p_reason: body.reason,
          p_reported_user_id:
            body.subjectType === 'user' ? body.reportedUserId : null,
          p_subject_type: body.subjectType,
          p_ws_id: context.context.normalizedWsId,
        }
      );
    } catch (error) {
      if (isRateLimited(error)) {
        return NextResponse.json(
          { message: 'Too many reports. Try again later.' },
          { status: 429 }
        );
      }
      return chatRpcErrorResponse(error, 'Failed to send report');
    }

    if (!result?.reportId) {
      return NextResponse.json(
        { message: 'Failed to send report' },
        { status: 500 }
      );
    }

    let blocked = false;
    const blockTarget =
      body.subjectType === 'ai_response' ? null : result.reportedUserId;
    if (body.subjectType !== 'ai_response' && body.alsoBlock && blockTarget) {
      try {
        await callPrivateChatRpc('chat_block_user', {
          p_actor_user_id: auth.user.id,
          p_target_user_id: blockTarget,
        });
        blocked = true;
      } catch (error) {
        console.error('Chat report saved but block failed', {
          code: (error as { code?: string }).code,
        });
      }
    }

    return NextResponse.json(
      { blocked, reportId: result.reportId },
      { status: 201 }
    );
  },
  { allowAppSessionAuth: true }
);
