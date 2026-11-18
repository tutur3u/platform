import 'server-only';

import {
  type ArenaBoardInput,
  arenaConfigInputSchema,
  quizArenaMutationSchema,
  quizArenaRoomCommandSchema,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { z } from 'zod';
import {
  type getMeetCallAccess,
  MeetCallAccessError,
} from '../lib/call-access';
import { starterArenaBoard } from '../lib/quiz-arena-boards';
import { miraBoardRequestSchema } from '../lib/quiz-arena-options';
import { generateMiraBoard } from './quiz-arena-mira';
import { buildUpskiiBoard, listUpskiiCourses } from './quiz-arena-upskii';
import { callRoomService } from './room-service';

type Access = Awaited<ReturnType<typeof getMeetCallAccess>>;

const quizArenaActions = z.union([
  quizArenaMutationSchema,
  z.strictObject({ action: z.literal('list_upskii') }),
  z.strictObject({
    action: z.literal('import_upskii'),
    courseId: z.uuid(),
    moduleId: z.uuid().optional(),
    bonusTiles: z.boolean().default(true),
    includeFinalRound: z.boolean().default(true),
    config: arenaConfigInputSchema,
  }),
  z.strictObject({
    action: z.literal('mira_generate_board'),
    request: miraBoardRequestSchema,
    config: arenaConfigInputSchema,
    /** Set only when the host chose the starter board after Mira was unavailable. */
    useStarterFallback: z.boolean().default(false),
  }),
]);
/** Provenance is server-assigned; a browser-supplied `source` is rejected. */
function hasClientProvenance(input: unknown) {
  if (!input || typeof input !== 'object') return false;
  const { source, board } = input as { source?: unknown; board?: unknown };
  return (
    source !== undefined ||
    (!!board && typeof board === 'object' && 'source' in board)
  );
}

export const quizArenaActionSchema = z.preprocess(
  (input) =>
    hasClientProvenance(input) ? { action: 'invalid_provenance' } : input,
  quizArenaActions
);
export type QuizArenaAction = z.input<typeof quizArenaActions>;
export type QuizArenaActionResult = {
  ok?: boolean;
  seq?: number;
  fallback?: boolean;
  courses?: Awaited<ReturnType<typeof listUpskiiCourses>>['courses'];
};

const setup = (access: Access, board: ArenaBoardInput, config: unknown) =>
  callRoomService<{ ok: true; seq: number }>(access, {
    action: 'arena.setup',
    board,
    config,
  });

export async function runQuizArenaAction(
  access: Access,
  action: z.output<typeof quizArenaActions>
): Promise<QuizArenaActionResult | unknown> {
  switch (action.action) {
    case 'list_upskii':
      await callRoomService(access, { action: 'arena.authorize' });
      return listUpskiiCourses(access);
    case 'import_upskii': {
      await callRoomService(access, { action: 'arena.authorize' });
      const board = await buildUpskiiBoard(access, action);
      return setup(access, board, action.config);
    }
    case 'mira_generate_board': {
      // The durable host check runs before any credit or model call.
      await callRoomService(access, { action: 'arena.authorize' });
      if (action.useStarterFallback) {
        const result = await setup(
          access,
          starterArenaBoard(action.request),
          action.config
        );
        return { ...result, fallback: true };
      }
      const board = await generateMiraBoard(access, action.request);
      if (!board) return { ok: false, fallback: true };
      return {
        ...(await setup(access, board, action.config)),
        fallback: false,
      };
    }
    default: {
      // Browser actions are always the host's own manual choices.
      const stamped =
        action.action === 'setup'
          ? { ...action, board: { ...action.board, source: 'manual' as const } }
          : action.action === 'pickTile'
            ? { ...action, source: 'host' as const }
            : action;
      const command = quizArenaRoomCommandSchema.safeParse({
        ...stamped,
        action: `arena.${stamped.action}`,
      });
      if (!command.success)
        throw new MeetCallAccessError(400, 'Invalid Quiz Arena action');
      return callRoomService(access, {
        ...stamped,
        action: `arena.${stamped.action}`,
      });
    }
  }
}
