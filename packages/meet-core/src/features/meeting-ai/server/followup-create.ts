import 'server-only';
import { createMeetWorkspaceTools } from '@tuturuuu/ai/meetings/workspace-tools';
import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { readPersonalChatBody } from '@tuturuuu/meet-core/features/call/server/personal-chat-body';
import { callRoomService } from '@tuturuuu/meet-core/features/call/server/room-service';
import { Effect, Schedule } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { buildFollowupPayload } from '../followup-save';
import { MeetAiError, type MeetAiParams } from './access';
import { followupAccess } from './followup-context';
import { prepareCalendarFollowup } from './followup-event';
import { prepareTaskFollowup } from './followup-task';

export const followupInputSchema = z.object({
  requestId: z.uuid(),
  startedAt: z.number().int(),
  kind: z.enum(['task', 'event']),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(10000),
  workspaceId: z.uuid(),
  userId: z.uuid(),
  boardId: z.string().max(36),
  listId: z.string().max(36),
  timezone: z
    .string()
    .max(100)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }),
  start: z.string().max(30),
  end: z.string().max(30),
  due: z.string().max(30),
  assignToMe: z.boolean(),
  assigneeIds: z.array(z.uuid()).max(100).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  calendarId: z.uuid().optional(),
  location: z.string().max(1000).optional(),
});

export async function createFollowup(request: Request, params: MeetAiParams) {
  let mayHaveWritten = false;
  try {
    return await createFollowupAttempt(request, params, () => {
      mayHaveWritten = true;
    });
  } catch (error) {
    if (!mayHaveWritten)
      throw new MeetAiError(
        error instanceof MeetAiError ? error.status : 500,
        error instanceof MeetAiError
          ? error.message
          : 'Could not prepare follow-up',
        'FOLLOWUP_NOT_SAVED'
      );
    throw error;
  }
}
async function createFollowupAttempt(
  request: Request,
  params: MeetAiParams,
  onAttempt: () => void
) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new MeetAiError(403, 'Invalid origin');
  let input: z.infer<typeof followupInputSchema>;
  try {
    input = followupInputSchema.parse(await readPersonalChatBody(request));
  } catch {
    throw new MeetAiError(400, 'Invalid follow-up');
  }
  const access = await followupAccess(request, params, input.workspaceId);
  if (input.userId !== access.user.id)
    throw new MeetAiError(409, 'Account changed; reopen review');
  let payload: ReturnType<typeof buildFollowupPayload>;
  try {
    payload = buildFollowupPayload(input);
  } catch {
    throw new MeetAiError(400, 'Invalid follow-up dates or destination');
  }
  const task = 'listId' in payload;
  const name = task ? 'create_task' : 'create_event';
  if (
    task &&
    (!z.uuid().safeParse(input.boardId).success ||
      !z.uuid().safeParse(input.listId).success)
  )
    throw new MeetAiError(400, 'Choose a board and list');
  const context = {
    userId: access.user.id,
    wsId: access.workspaceId,
    supabase: access.db,
    timezone: input.timezone,
  };
  const allowed = createMeetWorkspaceTools(
    context,
    access.permissions?.withoutPermission ?? (() => true)
  );
  if (!allowed[name])
    throw new MeetAiError(403, 'Destination permission denied');
  const args = { ...payload, ...(task ? { boardId: input.boardId } : {}) };
  const save =
    payload.listId !== undefined
      ? await prepareTaskFollowup(access, input.boardId, payload)
      : await prepareCalendarFollowup(access.db, access.workspaceId, payload);
  const room = await getMeetCallAccess(access.meetingId, 'Participant');
  if (room.user.id !== access.user.id)
    throw new MeetAiError(409, 'Account changed');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify({
        purpose: 'meeting_followup',
        name,
        args,
        workspaceId: access.workspaceId,
        userId: access.user.id,
      })
    )
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  onAttempt();
  const receipt = await callRoomService<{ started?: boolean; text?: string }>(
    room,
    {
      action: 'personal.begin',
      id: input.requestId,
      startedAt: input.startedAt,
      fingerprint,
    }
  );
  if (receipt.text) {
    const recovered = z
      .object({ url: z.url() })
      .safeParse(JSON.parse(receipt.text));
    if (!recovered.success)
      throw new MeetAiError(409, 'Follow-up receipt unavailable');
    return recovered.data;
  }
  if (!receipt.started)
    throw new MeetAiError(409, 'Follow-up already attempted');
  const result: unknown = await save();
  if (!result || typeof result !== 'object' || 'error' in result) {
    const rejected =
      result &&
      typeof result === 'object' &&
      'created' in result &&
      result.created === false;
    if (rejected)
      await callRoomService(room, {
        action: 'personal.release',
        id: input.requestId,
        fingerprint,
      });
    throw new MeetAiError(
      502,
      'Could not confirm follow-up save; check the destination',
      rejected ? 'FOLLOWUP_NOT_SAVED' : undefined
    );
  }
  const confirmed = (
    task
      ? z.object({ task: z.object({ id: z.uuid() }) })
      : z.object({ event: z.object({ id: z.uuid() }) })
  ).safeParse(result);
  if (!confirmed.success)
    throw new MeetAiError(
      502,
      'Follow-up result unavailable; check the destination'
    );
  const resultId =
    'task' in confirmed.data ? confirmed.data.task.id : confirmed.data.event.id;
  const base = `https://${task ? 'tasks' : 'calendar'}.tuturuuu.com/${encodeURIComponent(access.workspaceId)}`;
  const saved = {
    url:
      task && resultId ? `${base}/tasks/${encodeURIComponent(resultId)}` : base,
  };
  // Record recovery after the write. Never replay a write if saving its receipt fails.
  await Effect.runPromise(
    Effect.tryPromise({
      try: () =>
        callRoomService(room, {
          action: 'personal.finish',
          id: input.requestId,
          text: JSON.stringify(saved),
        }),
      catch: (error) => error,
    }).pipe(
      Effect.retry({ times: 2, schedule: Schedule.exponential('100 millis') }),
      Effect.catchAll(() =>
        Effect.sync(() => {
          console.warn('Meet follow-up receipt unavailable after save');
        })
      )
    )
  );
  return saved;
}
