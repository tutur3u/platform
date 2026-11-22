import { z } from 'zod';
import type { ActorLimitBuckets } from './actor-rate-limit';
import { liveActivityRequestIdSchema as requestId } from './live-activities-schema';
import {
  nextLiveActivityLimit,
  PENBOARD_ACTIONS_PER_MINUTE,
  serializedMeetBytes,
} from './live-activity-rate';
import { canMeetRealtimeManageParticipants } from './permissions';
import type { MeetRoomCommand, MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

export const PENBOARD_LIMITS = {
  width: 1200,
  height: 900,
  pointsPerStroke: 2000,
  strokesPerAuthor: 40,
  strokes: 128,
  // Keep the board snapshot below Meet's 256 KiB frame budget, including JSON
  // escaping and metadata. The finite receipt ledger survives undo and clear.
  boardBytes: 224 * 1024,
  strokeBytes: 160 * 1024,
  drawReceipts: 2048,
} as const;
export const penboardColors = ['ink', 'blue', 'green', 'red'] as const;
export const penboardPointSchema = z.object({
  x: z.number().min(0).max(PENBOARD_LIMITS.width),
  y: z.number().min(0).max(PENBOARD_LIMITS.height),
  pressure: z.number().min(0).max(1),
  tiltX: z.number().int().min(-90).max(90),
  tiltY: z.number().int().min(-90).max(90),
  t: z.number().int().nonnegative(),
});
export const penboardStrokeSchema = z.object({
  id: z.uuid(),
  authorId: z.string().max(36),
  input: z.enum(['pen', 'touch', 'mouse']),
  color: z.enum(penboardColors),
  width: z.number().positive().max(24),
  startedAt: z.number().int().nonnegative(),
  points: z
    .array(penboardPointSchema)
    .min(1)
    .max(PENBOARD_LIMITS.pointsPerStroke)
    .readonly(),
});
export type PenboardStroke = z.infer<typeof penboardStrokeSchema>;
export const penboardClientMessages = [
  z.object({ type: z.literal('penboard.read'), requestId }),
  z.object({
    type: z.literal('penboard.draw'),
    stroke: penboardStrokeSchema,
    requestId,
  }),
  z.object({ type: z.literal('penboard.undo'), requestId }),
  z.object({ type: z.literal('penboard.clear'), requestId }),
] as const;

export type PenboardServerMessage =
  | {
      type: 'penboard.snapshot';
      revision: number;
      strokes: readonly PenboardStroke[];
      requestId?: string;
    }
  | {
      type: 'penboard.stroke';
      revision: number;
      stroke: PenboardStroke;
      requestId?: string;
    };

type PenboardState = {
  revision: number;
  strokes: PenboardStroke[];
  drawIds: Record<string, { id: string; revision: number }>;
};
declare module './room' {
  interface MeetRoomSnapshot {
    penboard?: PenboardState;
    penboardLimits?: ActorLimitBuckets;
  }
}
const EMPTY_BOARD: PenboardState = { revision: 0, strokes: [], drawIds: {} };

function boardSnapshot(
  { revision, strokes }: PenboardState,
  requestId?: string
): PenboardServerMessage {
  return { type: 'penboard.snapshot', revision, strokes, requestId };
}

export function applyPenboard(
  state: MeetRoomSnapshot,
  { message, token, now }: MeetRoomCommand
) {
  if (
    message.type !== 'penboard.read' &&
    message.type !== 'penboard.draw' &&
    message.type !== 'penboard.undo' &&
    message.type !== 'penboard.clear'
  )
    return null;
  const { requestId } = message;
  const userId = token.userId;
  const timestamp = Date.parse(now);
  if (
    state.ended ||
    !state.presence[userId] ||
    state.waiting[userId] ||
    (state.budget && timestamp >= state.budget.expiresAt)
  )
    return denied(state, 'awaiting_admission', requestId);
  const board = state.penboard ?? EMPTY_BOARD;
  if (message.type === 'penboard.read')
    return outcome(state, { reply: [boardSnapshot(board, requestId)] });

  const manager = canMeetRealtimeManageParticipants(token);
  if (message.type === 'penboard.clear' && !manager)
    return denied(state, 'permission_denied', requestId);
  const limits = nextLiveActivityLimit(
    state.penboardLimits,
    token.accountId ?? userId,
    timestamp,
    PENBOARD_ACTIONS_PER_MINUTE
  );
  if (!limits) return denied(state, 'penboard_rate_limited', requestId);
  const revision = board.revision + 1;
  if (message.type === 'penboard.draw') {
    const key = `${userId}:${message.stroke.id}`;
    const prior = board.drawIds[key];
    if (prior) {
      const stroke = board.strokes.find(({ id }) => id === prior.id);
      if (!stroke) return denied(state, 'penboard_stroke_removed', requestId);
      return outcome(state, {
        reply: [
          {
            type: 'penboard.stroke',
            revision: prior.revision,
            stroke,
            requestId,
          },
        ],
      });
    }
    if (
      board.strokes.length >= PENBOARD_LIMITS.strokes ||
      board.strokes.filter(({ authorId }) => authorId === userId).length >=
        PENBOARD_LIMITS.strokesPerAuthor
    )
      return denied(state, 'penboard_full', requestId);
    // A full ledger forgets receipts of strokes no longer on the board, so a
    // long session keeps drawing. Receipts of visible strokes always stay.
    let drawIds = board.drawIds;
    if (Object.keys(drawIds).length >= PENBOARD_LIMITS.drawReceipts) {
      const visible = new Set(board.strokes.map(({ id }) => id));
      drawIds = Object.fromEntries(
        Object.entries(drawIds).filter(([, receipt]) => visible.has(receipt.id))
      );
    }
    const stroke = {
      ...message.stroke,
      id: crypto.randomUUID(),
      authorId: userId,
      startedAt: timestamp,
    };
    const strokes = [...board.strokes, stroke];
    if (
      serializedMeetBytes(stroke) > PENBOARD_LIMITS.strokeBytes ||
      serializedMeetBytes(strokes) > PENBOARD_LIMITS.boardBytes
    )
      return denied(state, 'penboard_full', requestId);
    const penboard: PenboardState = {
      revision,
      strokes,
      drawIds: { ...drawIds, [key]: { id: stroke.id, revision } },
    };
    return outcome(
      { ...state, penboard, penboardLimits: limits },
      {
        broadcast: [{ type: 'penboard.stroke', revision, stroke }],
        reply: requestId
          ? [{ type: 'penboard.stroke', revision, stroke, requestId }]
          : [],
      }
    );
  }

  let index = board.strokes.length - 1;
  while (!manager && index >= 0 && board.strokes[index]?.authorId !== userId)
    index--;
  if (index < 0)
    return outcome(state, {
      reply: requestId ? [boardSnapshot(board, requestId)] : [],
    });
  const strokes =
    message.type === 'penboard.clear'
      ? []
      : board.strokes.filter((_, position) => position !== index);
  const penboard: PenboardState = { ...board, revision, strokes };
  return outcome(
    { ...state, penboard, penboardLimits: limits },
    {
      broadcast: [boardSnapshot(penboard)],
      reply: requestId ? [boardSnapshot(penboard, requestId)] : [],
    }
  );
}
