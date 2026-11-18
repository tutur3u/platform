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

export const quizArenaActionSchema = z.union([
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
export type QuizArenaAction = z.input<typeof quizArenaActionSchema>;
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
  action: z.output<typeof quizArenaActionSchema>
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
      const command = quizArenaRoomCommandSchema.safeParse({
        ...action,
        action: `arena.${action.action}`,
      });
      if (!command.success)
        throw new MeetCallAccessError(400, 'Invalid Quiz Arena action');
      return callRoomService(access, {
        ...action,
        action: `arena.${action.action}`,
      });
    }
  }
}
