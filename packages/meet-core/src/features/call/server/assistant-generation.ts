import { getScenarioPrompt } from '@tuturuuu/meet-core/parley/repository';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import {
  requireRoomMiraAuthority,
  requireRoomMiraDispatch,
  requireRoomMiraFence,
} from '../../live-assistant/server/room-mira-authority';
import 'server-only';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import {
  answerMeetChat,
  type MeetAssistantMessage,
} from '@tuturuuu/ai/meetings/chat';
import { createMeetWorkspaceTools } from '@tuturuuu/ai/meetings/workspace-tools';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { MeetCallAccessError } from '../lib/call-access';
import { billMeetChat } from './chat-billing';
import { getMeetChatModel } from './chat-model';
import {
  callRoomService,
  personalWorkspace,
  type SignedInMeetCallAccess,
} from './room-service';

type Access = SignedInMeetCallAccess;
export type PrivateAssistantReview = {
  text: string;
  continuation: string;
  approvals: Array<{ id: string; toolName: string; input: unknown }>;
  workspaceId: string;
  workspaceName: string;
  timezone: string;
  status: 'ready' | 'executing' | 'interrupted' | 'shared' | 'discarded';
  revision: number;
};
const roomContextSchema = z.object({
  chat: z.array(
    z.object({
      body: z.string(),
      displayName: z.string(),
      assistant: z.boolean().optional(),
    })
  ),
  prompt: z.string(),
  meetingContext: z.object({
    observedAt: z.string(),
    participantCount: z.number().int().nonnegative(),
    deviceCount: z.number().int().nonnegative(),
    participants: z.array(
      z.object({ displayName: z.string(), role: z.string() })
    ),
  }),
});
type RoomContext = z.infer<typeof roomContextSchema>;

export async function generateMeetAssistant(
  access: Access,
  input: {
    messageId: string;
    timezone: string;
    workspaceId?: string;
    resume?: { revision: number; approved: boolean };
  }
) {
  // Room Mira: eligible requester, attested meeting workspace, and payer.
  const room = await requireRoomMiraAuthority(access);
  // Checked before any credit work; the room rechecks it atomically when it
  // releases room content for this request.
  await requireRoomMiraFence(access);
  const wsId = room.billingWorkspaceId;
  const existing = input.resume
    ? await callRoomService<PrivateAssistantReview>(access, {
        action: 'ai.review.get',
        messageId: input.messageId,
      })
    : undefined;
  // Tools act in the requester's chosen workspace, never the billing one.
  const workspaceId =
    existing?.workspaceId ??
    input.workspaceId ??
    (await personalWorkspace(access.user.id));
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
  let messages: MeetAssistantMessage[] | undefined;
  if (input.resume) {
    const review = await callRoomService<PrivateAssistantReview>(access, {
      action: 'ai.review.claim',
      messageId: input.messageId,
      revision: input.resume.revision,
    });
    let saved: { messages: MeetAssistantMessage[]; context: RoomContext };
    try {
      const raw = JSON.parse(review.continuation);
      if (!raw || !Array.isArray(raw.messages))
        throw new Error('Invalid review continuation');
      saved = {
        messages: raw.messages,
        context: roomContextSchema.parse(raw.context),
      };
    } catch {
      await callRoomService(access, {
        action: 'ai.finish',
        messageId: input.messageId,
        costUsd: 0,
      }).catch(() => undefined);
      throw new MeetCallAccessError(409, 'Review data is unavailable');
    }
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
  let costUsd: number | null = 0;
  let settlement: Record<string, unknown> | undefined;
  try {
    const scenarioInstructions =
      MEETING_APP === 'parley'
        ? await getScenarioPrompt(access.meeting.id)
        : undefined;
    const inputBudget =
      3 *
        (JSON.stringify(messages ?? context).length +
          (scenarioInstructions?.length ?? 0) +
          6000) +
      8192;
    const answer = await billMeetChat(
      {
        userId: access.user.id,
        workspaceId: wsId,
        model,
        maxOutputTokens: cap,
        inputBudget,
        remainingCredits: allowance.remainingCredits,
        requestId: `${access.meeting.id}:${input.messageId}:${input.resume?.revision ?? 'initial'}`,
        meetingId: access.meeting.id,
        allowSearch: !messages && MEETING_APP !== 'parley',
      },
      async (allowSearch) => {
        await requireRoomMiraDispatch(access, input.messageId);
        costUsd = null;
        const generated = await answerMeetChat(
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
            allowSearch,
            provider: { apiKey: room.apiKey },
            scenarioInstructions,
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
        costUsd = generated.costUsd;
        return generated;
      }
    );
    costUsd = answer.costUsd;
    if (!answer.text.trim() && !answer.approvals?.length)
      throw new MeetCallAccessError(
        503,
        'AI returned no answer. Please try again.'
      );
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
    if (settlement) {
      try {
        await callRoomService(access, settlement);
        return {
          ok: true,
          ...(settlement.action === 'ai.review.save'
            ? { reviewId: input.messageId }
            : {}),
        };
      } catch {
        // Retain any saved review and record incurred usage when delivery stays unavailable.
      }
    }
    await callRoomService(access, {
      action: 'ai.finish',
      messageId: input.messageId,
      costUsd,
    }).catch(() => undefined);
    throw error;
  }
  throw new MeetCallAccessError(503, 'Assistant response unavailable');
}
