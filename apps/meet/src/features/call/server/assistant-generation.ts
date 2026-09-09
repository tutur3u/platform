import 'server-only';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { answerMeetChat } from '@tuturuuu/ai/meetings/chat';
import type { MeetAssistantContext } from '@tuturuuu/ai/meetings/chat-tools';
import { createMeetWorkspaceTools } from '@tuturuuu/ai/meetings/workspace-tools';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { ModelMessage } from 'ai';
import { MeetCallAccessError } from '../lib/call-access';
import { getMeetChatModel } from './chat-model';
import { callRoomService, personalWorkspace } from './room-service';

type Access = Parameters<typeof callRoomService>[0];
export type PrivateAssistantReview = {
  text: string;
  continuation: string;
  approvals: Array<{ id: string; toolName: string; input: unknown }>;
  workspaceId: string;
  workspaceName: string;
  timezone: string;
  status: 'ready' | 'executing' | 'shared' | 'discarded';
  revision: number;
};
type RoomContext = {
  chat: Array<{ body: string; displayName: string; assistant?: boolean }>;
  prompt: string;
  meetingContext: Omit<MeetAssistantContext, 'title' | 'timezone'>;
};

export async function generateMeetAssistant(
  access: Access,
  input: {
    messageId: string;
    timezone: string;
    workspaceId?: string;
    resume?: { revision: number; approved: boolean };
  }
) {
  const wsId = await personalWorkspace(access.user.id);
  const existing = input.resume
    ? await callRoomService<PrivateAssistantReview>(access, {
        action: 'ai.review.get',
        messageId: input.messageId,
      })
    : undefined;
  const workspaceId = existing?.workspaceId ?? input.workspaceId ?? wsId;
  const db = await createAdminClient({ noCookie: true });
  const membership = await verifyWorkspaceMembershipType({
    supabase: db,
    userId: access.user.id,
    wsId: workspaceId,
    requiredType: 'MEMBER',
  });
  if (!membership.ok)
    throw new MeetCallAccessError(403, 'Workspace access denied');
  const { data: workspace } = await db
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .single();
  const workspaceName = workspace?.name ?? 'Workspace';
  const permissions = await getPermissions({
    wsId: workspaceId,
    user: access.user,
  });
  const model = await getMeetChatModel(wsId);
  const allowance = await checkAiCredits(wsId, model.id, 'chat', {
    userId: access.user.id,
    estimatedInputTokens: existing
      ? Math.ceil(existing.continuation.length / 2) + 24000
      : 36000,
  });
  if (!allowance.allowed)
    throw new MeetCallAccessError(
      403,
      allowance.errorMessage ?? 'AI quota is unavailable'
    );
  const cap = await capMaxOutputTokensByCredits(
    db,
    model.id,
    Math.min(allowance.maxOutputTokens ?? 2048, 2048),
    allowance.remainingCredits
  );
  if (!cap) throw new MeetCallAccessError(403, 'AI quota is exhausted');
  let context: RoomContext;
  let messages: ModelMessage[] | undefined;
  if (input.resume) {
    const review = await callRoomService<PrivateAssistantReview>(access, {
      action: 'ai.review.claim',
      messageId: input.messageId,
      revision: input.resume.revision,
    });
    const saved = JSON.parse(review.continuation) as {
      messages: ModelMessage[];
      context: RoomContext;
    };
    context = saved.context;
    messages = [
      ...saved.messages,
      {
        role: 'tool',
        content: review.approvals.map((approval) => ({
          type: 'tool-approval-response' as const,
          approvalId: approval.id,
          approved: input.resume!.approved,
        })),
      },
    ];
  } else
    context = await callRoomService<RoomContext>(access, {
      action: 'ai.reserve',
      messageId: input.messageId,
    });
  let costUsd: number | null = null;
  let settlement: unknown;
  try {
    const answer = await answerMeetChat(
      context.chat,
      cap,
      context.prompt,
      model,
      {
        ...context.meetingContext,
        title: access.meeting.name ?? 'Untitled meeting',
        timezone: existing?.timezone ?? input.timezone,
      },
      {
        messages,
        workspaceTools: createMeetWorkspaceTools(
          {
            userId: access.user.id,
            wsId: workspaceId,
            creditWsId: wsId,
            supabase: db,
            timezone: existing?.timezone ?? input.timezone,
          },
          permissions?.withoutPermission ?? (() => true)
        ),
      }
    );
    costUsd = answer.costUsd;
    if (!answer.usage.available)
      throw new MeetCallAccessError(503, 'AI usage accounting is unavailable');
    const charge = await deductAiCredits({
      wsId,
      userId: access.user.id,
      modelId: model.id,
      inputTokens: answer.usage.inputTokens,
      outputTokens: answer.usage.outputTokens,
      searchCount: answer.searchCount,
      feature: 'chat',
      metadata: {
        source: 'meet_mira',
        meetingId: access.meeting.id,
        messageId: input.messageId,
      },
    });
    if (!charge.success)
      throw new MeetCallAccessError(503, 'AI quota accounting failed');
    settlement = answer.privateResult
      ? {
          action: 'ai.review.save',
          messageId: input.messageId,
          costUsd,
          review: {
            text: answer.text.slice(0, 16000),
            continuation: JSON.stringify({
              messages: answer.messages,
              context,
            }),
            approvals: answer.approvals,
            workspaceId,
            workspaceName,
            timezone: existing?.timezone ?? input.timezone,
          },
        }
      : {
          action: 'ai.finish',
          messageId: input.messageId,
          body: answer.text.slice(0, 16000),
          costUsd,
        };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await callRoomService(access, settlement);
        return {
          ok: true,
          ...(answer.privateResult ? { reviewId: input.messageId } : {}),
        };
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1))
        );
      }
    }
  } catch (error) {
    await callRoomService(access, {
      action: 'ai.finish',
      messageId: input.messageId,
      costUsd,
    }).catch(() => undefined);
    throw error;
  }
  throw new MeetCallAccessError(503, 'Assistant response unavailable');
}
