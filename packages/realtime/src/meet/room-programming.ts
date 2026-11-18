import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { roomSettingsMessage } from './room-controls';
import {
  applyRoomProgrammingMira,
  programmingMiraRead,
  programmingMiraResolutionPending,
} from './room-programming-mira';
import type { RoomServiceState } from './room-service';

export const meetingProgrammingSchema = z
  .object({
    kind: z.enum(['playground', 'problem']),
    id: z.uuid(),
    language: z.enum([
      'python',
      'javascript',
      'typescript',
      'c',
      'cpp',
      'java',
      'rust',
      'go',
      'ruby',
      'php',
      'shell',
    ]),
  })
  .strict();
export type MeetingProgramming = z.infer<typeof meetingProgrammingSchema>;
/** Only signed server callers can set a selection after resource authorization. */
export function applyRoomProgramming(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown
) {
  const parsed = z
    .discriminatedUnion('action', [
      z.object({
        action: z.literal('programming.read'),
        mira: z.literal(true).optional(),
      }),
      z.object({
        action: z.literal('programming.set'),
        selection: meetingProgrammingSchema.nullable(),
        generation: z.uuid().optional(),
      }),
    ])
    .safeParse(input);
  if (!parsed.success)
    return applyRoomProgrammingMira(
      snapshot,
      token,
      snapshot.settings?.programming ?? null,
      input
    );
  const account = token.accountId ?? token.userId;
  const present = Object.values(snapshot.presence).some(
    (person) => (person.accountId ?? person.userId) === account
  );
  const admitted =
    present ||
    token.role === 'host' ||
    token.scopes.includes('meet:workspace-member') ||
    !!snapshot.approved?.[account];
  if (
    !token.scopes.includes('meet:server') ||
    !admitted ||
    (parsed.data.action === 'programming.read' &&
      parsed.data.mira &&
      !present) ||
    snapshot.ended ||
    (parsed.data.action === 'programming.set' && token.role !== 'host')
  )
    return {
      state: snapshot,
      body: { error: 'Programming access denied' },
      status: 403,
    };
  if (parsed.data.action === 'programming.read')
    return {
      state: snapshot,
      body: {
        selection: snapshot.settings?.programming ?? null,
        ...(parsed.data.mira ? programmingMiraRead(snapshot, token) : {}),
      },
    };
  if (programmingMiraResolutionPending(snapshot))
    return {
      state: snapshot,
      body: { error: 'A fix is being resolved' },
      status: 409,
    };
  const state = {
    ...snapshot,
    programmingMira: parsed.data.generation
      ? { generation: parsed.data.generation, presence: null }
      : undefined,
    settings: {
      ...snapshot.settings,
      shareNotes: snapshot.settings?.shareNotes ?? false,
      programming: parsed.data.selection,
    },
  };
  return {
    state,
    body: { selection: parsed.data.selection },
    messages: [roomSettingsMessage(state)],
  };
}
