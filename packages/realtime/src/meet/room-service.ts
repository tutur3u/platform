import { z } from 'zod';
import {
  hasMeetAssistantMention,
  MEET_ASSISTANT_USER_ID,
} from './assistant-mentions';
import {
  type AssistantReview,
  assistantReviewCommand,
} from './assistant-review';
import type {
  MeetRealtimeServerMessage,
  MeetRealtimeTokenPayload,
  MeetRoomSnapshot,
} from './index';
import type { RoomRecording } from './room-recording';
import { summarizeRoomUsage } from './room-usage';

const attachment = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(100_000_000),
  contentType: z.string().max(255),
  path: z.string().trim().min(1).max(1024),
  storageWsId: z.uuid(),
});
export type RoomAttachment = z.infer<typeof attachment> & {
  ownerAccountId?: string;
  discarded?: boolean;
  published?: boolean;
};
export type RoomChatMessage = Extract<
  MeetRealtimeServerMessage,
  { type: 'chat.message' }
>;
export type RoomServiceState = MeetRoomSnapshot & {
  chat?: RoomChatMessage[];
  attachments?: Record<string, RoomAttachment>;
  aiRequests?: Record<
    string,
    {
      userId: string;
      status: 'pending' | 'done' | 'failed';
      review?: AssistantReview;
      startedAt?: number;
      costUsd?: number | null;
    }
  >;
};
const command = z.union([
  assistantReviewCommand,
  z.discriminatedUnion('action', [
    z.object({ action: z.literal('read') }),
    z.object({ action: z.literal('ai.review.list') }),
    z.object({ action: z.literal('costs') }),
    z.object({ action: z.literal('recording.list') }),
    z.object({ action: z.literal('attach'), attachment }),
    z.object({ action: z.literal('attachment'), id: z.uuid() }),
    z.object({ action: z.literal('attachment.discard'), id: z.uuid() }),
    z.object({ action: z.literal('attachment.deleted'), id: z.uuid() }),
    z.object({
      action: z.literal('recording.save'),
      sessionId: z.uuid(),
      path: z.string().trim().min(1).max(1024),
      storageWsId: z.uuid(),
    }),
    z.object({ action: z.literal('recording.read'), sessionId: z.uuid() }),
    z.object({ action: z.literal('recording.authorize'), sessionId: z.uuid() }),
    z.object({
      action: z.literal('ai.reserve'),
      messageId: z.string().max(200),
    }),
    z.object({
      action: z.literal('ai.finish'),
      messageId: z.string().max(200),
      body: z.string().max(16000).optional(),
      costUsd: z.number().nonnegative().nullable().optional(),
    }),
  ]),
]);
export function roomService(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown
): {
  state: RoomServiceState;
  body: unknown;
  status?: number;
  messages?: MeetRealtimeServerMessage[];
} {
  const fail = (error: string, status = 403) => ({
    state: snapshot,
    body: { error },
    status,
  });
  if (!token.scopes.includes('meet:server')) return fail('Forbidden');
  const parsed = command.safeParse(input);
  if (!parsed.success) return fail('Invalid request', 400);
  const accountId = token.accountId ?? token.userId;
  const admitted = Object.values(snapshot.presence).some(
    (person) => (person.accountId ?? person.userId) === accountId
  );
  const approved =
    admitted ||
    !!snapshot.approved?.[accountId] ||
    token.scopes.includes('meet:workspace-member');
  const admin = token.role === 'host';
  const message = parsed.data;
  if (message.action === 'ai.review.list')
    return {
      state: snapshot,
      body: Object.entries(snapshot.aiRequests ?? {}).flatMap(
        ([id, request]) =>
          request.userId === accountId &&
          request.review &&
          ['ready', 'executing'].includes(request.review.status)
            ? [{ id, status: request.review.status }]
            : []
      ),
    };
  if (message.action === 'recording.authorize') {
    const record = snapshot.recordings?.find(
      (r) => r.sessionId === message.sessionId && r.ownerAccountId === accountId
    );
    return record
      ? { state: snapshot, body: { ok: true, saved: !!record.path } }
      : fail('Recording unavailable', 409);
  }
  if (message.action === 'recording.save') {
    const record = snapshot.recordings?.find(
      (r) => r.sessionId === message.sessionId && r.ownerAccountId === accountId
    );
    if (!record) return fail('Recording unavailable', 409);
    if (record.path)
      return record.path === message.path &&
        record.storageWsId === message.storageWsId
        ? { state: snapshot, body: { ok: true } }
        : fail('Recording unavailable', 409);
    const recordings = snapshot.recordings!.map((r) =>
      r === record
        ? {
            ...record,
            path: message.path,
            storageWsId: message.storageWsId,
            status: 'ready' as const,
            endedAt: new Date().toISOString(),
          }
        : r
    );
    return { state: { ...snapshot, recordings }, body: { ok: true } };
  }
  if (message.action === 'recording.list') {
    if (!admin && !(approved && snapshot.settings?.shareRecordings))
      return fail('Recording access is disabled');
    return {
      state: snapshot,
      body: {
        recordings: (snapshot.recordings ?? []).map(
          ({ sessionId, startedAt, endedAt, status }) => ({
            sessionId,
            startedAt,
            endedAt,
            status,
          })
        ),
      },
    };
  }
  if (message.action === 'recording.read') {
    if (!admin && !(approved && snapshot.settings?.shareRecordings))
      return fail('Recording access is disabled');
    const record = snapshot.recordings?.find(
      (r) => r.sessionId === message.sessionId && r.status === 'ready'
    );
    return record
      ? { state: snapshot, body: record }
      : fail('Recording unavailable', 404);
  }
  if (message.action === 'costs') {
    if (!admin) return fail('Forbidden');
    return {
      state: snapshot,
      body: {
        cloudflare: summarizeRoomUsage(snapshot.usage),
        miraRequests: Object.values(snapshot.aiRequests ?? {}).length,
        miraCostUsd: Object.values(snapshot.aiRequests ?? {}).reduce(
          (sum, r) => sum + (r.costUsd ?? 0),
          0
        ),
        miraUnpriced: Object.values(snapshot.aiRequests ?? {}).filter(
          (r) => r.costUsd == null
        ).length,
      },
    };
  }
  if (message.action === 'read') {
    if (!admitted && !admin) return fail('Join the meeting first');
    return {
      state: snapshot,
      body: {
        chat: snapshot.chat ?? [],
        settings: snapshot.settings ?? { shareNotes: false },
        recording: snapshot.recording,
        recordings:
          admin || snapshot.settings?.shareRecordings
            ? (snapshot.recordings ?? []).map(
                ({ sessionId, startedAt, endedAt, status }: RoomRecording) => ({
                  sessionId,
                  startedAt,
                  endedAt,
                  status,
                })
              )
            : [],
        ...(admin
          ? {
              aiRequests: Object.fromEntries(
                Object.entries(snapshot.aiRequests ?? {}).map(
                  ([id, { review: _, ...request }]) => [id, request]
                )
              ),
              cloudflare: summarizeRoomUsage(snapshot.usage),
            }
          : {}),
      },
    };
  }
  if (message.action === 'attachment.deleted') {
    const file = snapshot.attachments?.[message.id];
    if (!file) return { state: snapshot, body: { ok: true } };
    if (file.ownerAccountId !== accountId || !file.discarded || file.published)
      return fail('Attachment cannot be removed');
    const attachments = { ...snapshot.attachments };
    delete attachments[message.id];
    return { state: { ...snapshot, attachments }, body: { ok: true } };
  }
  if (message.action === 'attachment.discard') {
    const file = snapshot.attachments?.[message.id];
    if (!file || file.ownerAccountId !== accountId)
      return fail('Attachment unavailable', 404);
    if (file.published) return fail('Attachment is already shared', 409);
    return {
      state: {
        ...snapshot,
        attachments: {
          ...snapshot.attachments,
          [message.id]: { ...file, discarded: true },
        },
      },
      body: { path: file.path, storageWsId: file.storageWsId },
    };
  }
  // Finalize an already authorized generation even if its user left meanwhile.
  if (
    ![
      'ai.finish',
      'ai.review.save',
      'ai.review.get',
      'ai.review.discard',
    ].includes(message.action) &&
    (!admitted || snapshot.ended)
  )
    return fail('Join the active meeting first');
  if (message.action === 'attach') {
    if (Object.keys(snapshot.attachments ?? {}).length >= 1000)
      return fail('Room attachment limit reached', 409);
    return {
      state: {
        ...snapshot,
        attachments: {
          ...snapshot.attachments,
          [message.attachment.id]: {
            ...message.attachment,
            ownerAccountId: accountId,
          },
        },
      },
      body: { ok: true },
    };
  }
  if (message.action === 'attachment') {
    const file = snapshot.attachments?.[message.id];
    return file && !file.discarded
      ? { state: snapshot, body: file }
      : fail('Attachment unavailable', 404);
  }
  if (message.action === 'ai.reserve') {
    if (
      Object.values(snapshot.aiRequests ?? {}).some(
        (request) =>
          request.userId === accountId &&
          request.status === 'pending' &&
          (request.startedAt === undefined ||
            Date.now() - request.startedAt < 120000)
      )
    )
      return fail('Assistant request already in progress', 409);
    if (Object.keys(snapshot.aiRequests ?? {}).length >= 1000)
      return fail('Room assistant limit reached', 409);
    const original = snapshot.chat?.find(
      (m) =>
        m.id === message.messageId &&
        (m.accountId ?? m.userId) === accountId &&
        hasMeetAssistantMention(m.body)
    );
    if (!original) return fail('Mention not found', 404);
    if (snapshot.aiRequests?.[message.messageId])
      return fail('Assistant already requested', 409);
    const state = {
      ...snapshot,
      aiRequests: {
        ...snapshot.aiRequests,
        [message.messageId]: {
          userId: accountId,
          status: 'pending' as const,
          startedAt: Date.now(),
        },
      },
    };
    return {
      state,
      body: {
        chat: snapshot.chat?.slice(-40) ?? [],
        prompt: original.body,
        meetingContext: {
          observedAt: new Date().toISOString(),
          deviceCount: Object.keys(snapshot.presence).length,
          participantCount: new Set(
            Object.values(snapshot.presence).map(
              (person) => person.accountId ?? person.userId
            )
          ).size,
          participants: [
            ...new Map(
              Object.values(snapshot.presence).map((person) => [
                person.accountId ?? person.userId,
                { displayName: person.displayName, role: person.role },
              ])
            ).values(),
          ],
        },
      },
    };
  }
  const pending = snapshot.aiRequests?.[message.messageId];
  if (!pending || pending.userId !== accountId)
    return fail('Assistant request unavailable', 409);
  if (message.action.startsWith('ai.review.')) {
    const parsedReview = assistantReviewCommand.parse(message);
    if (parsedReview.action === 'ai.review.get') {
      return pending.review
        ? {
            state: snapshot,
            body:
              pending.review.status === 'executing' &&
              (pending.status === 'failed' ||
                Date.now() - (pending.startedAt ?? 0) > 120000)
                ? { ...pending.review, status: 'interrupted' }
                : pending.review,
          }
        : fail('Review unavailable', 404);
    }
    if (parsedReview.action === 'ai.review.save') {
      if (
        pending.review?.status === 'ready' &&
        pending.review.continuation === parsedReview.review.continuation
      )
        return { state: snapshot, body: pending.review };
      if (
        pending.status !== 'pending' ||
        (pending.review && pending.review.status !== 'executing')
      )
        return fail('Review is not being generated', 409);
      const otherReviews = Object.entries(snapshot.aiRequests ?? {}).filter(
        ([id, request]) =>
          id !== message.messageId &&
          request.review &&
          ['ready', 'executing'].includes(request.review.status)
      );
      const privateBytes =
        otherReviews.reduce(
          (sum, [, request]) =>
            sum +
            new TextEncoder().encode(request.review!.continuation).byteLength,
          0
        ) +
        new TextEncoder().encode(parsedReview.review.continuation).byteLength;
      if (otherReviews.length >= 4 || privateBytes > 400000)
        return fail(
          'Private review capacity reached. Finish existing reviews first.',
          409
        );
      const review: AssistantReview = {
        ...parsedReview.review,
        status: 'ready',
        revision: (pending.review?.revision ?? 0) + 1,
      };
      const costUsd =
        pending.costUsd === null || parsedReview.costUsd === null
          ? null
          : (pending.costUsd ?? 0) + parsedReview.costUsd;
      return {
        state: {
          ...snapshot,
          aiRequests: {
            ...snapshot.aiRequests,
            [message.messageId]: {
              ...pending,
              status: 'done',
              review,
              costUsd,
            },
          },
        },
        body: review,
      };
    }
    const review = pending.review;
    const canDiscardInterrupted =
      parsedReview.action === 'ai.review.discard' &&
      review?.status === 'executing' &&
      (pending.status === 'failed' ||
        Date.now() - (pending.startedAt ?? 0) > 120000);
    if (
      (!canDiscardInterrupted && review?.status !== 'ready') ||
      review?.revision !== parsedReview.revision
    )
      return fail('Review changed or already handled', 409);
    if (parsedReview.action === 'ai.review.claim') {
      if (
        Object.entries(snapshot.aiRequests ?? {}).some(
          ([id, request]) =>
            id !== message.messageId &&
            request.userId === accountId &&
            request.status === 'pending' &&
            (request.startedAt === undefined ||
              Date.now() - request.startedAt < 120000)
        )
      )
        return fail('Assistant request already in progress', 409);
      if (!review.approvals.length)
        return fail('No actions awaiting approval', 409);
      const claimed = { ...review, status: 'executing' as const };
      return {
        state: {
          ...snapshot,
          aiRequests: {
            ...snapshot.aiRequests,
            [message.messageId]: {
              ...pending,
              status: 'pending',
              startedAt: Date.now(),
              review: claimed,
            },
          },
        },
        body: claimed,
      };
    }
    if (parsedReview.action === 'ai.review.discard') {
      return {
        state: {
          ...snapshot,
          aiRequests: {
            ...snapshot.aiRequests,
            [message.messageId]: {
              ...pending,
              review: {
                ...review,
                continuation: '',
                text: '',
                approvals: [],
                status: 'discarded',
              },
            },
          },
        },
        body: { ok: true },
      };
    }
    if (review.approvals.length)
      return fail('Resolve pending actions before sharing', 409);
    if (!review.text.trim()) return fail('There is no answer to share', 409);
    const response: RoomChatMessage = {
      type: 'chat.message',
      id: crypto.randomUUID(),
      userId: MEET_ASSISTANT_USER_ID,
      displayName: 'Mira',
      assistant: true,
      body: review.text,
      createdAt: new Date().toISOString(),
    };
    return {
      state: {
        ...snapshot,
        chat: [...(snapshot.chat ?? []), response].slice(-200),
        aiRequests: {
          ...snapshot.aiRequests,
          [message.messageId]: {
            ...pending,
            review: { ...review, continuation: '', status: 'shared' },
          },
        },
      },
      body: { ok: true },
      messages: [response],
    };
  }
  if (message.action !== 'ai.finish')
    return fail('Invalid assistant action', 400);
  if (pending.status === 'done') return { state: snapshot, body: { ok: true } };
  if (pending.status !== 'pending')
    return fail('Assistant request unavailable', 409);
  const response: RoomChatMessage | undefined = message.body
    ? {
        type: 'chat.message',
        id: crypto.randomUUID(),
        userId: MEET_ASSISTANT_USER_ID,
        displayName: 'Mira',
        assistant: true,
        body: message.body,
        createdAt: new Date().toISOString(),
      }
    : undefined;
  const state = {
    ...snapshot,
    aiRequests: {
      ...snapshot.aiRequests,
      [message.messageId]: {
        ...pending,
        status: response ? ('done' as const) : ('failed' as const),
        costUsd:
          pending.costUsd === null || message.costUsd === null
            ? null
            : (pending.costUsd ?? 0) + (message.costUsd ?? 0),
      },
    },
    chat: response
      ? [...(snapshot.chat ?? []), response].slice(-500)
      : snapshot.chat,
  };
  return { state, body: { ok: true }, messages: response ? [response] : [] };
}
