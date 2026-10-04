import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { roomSettingsMessage } from './room-controls';
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
      z.object({ action: z.literal('programming.read') }),
      z.object({
        action: z.literal('programming.set'),
        selection: meetingProgrammingSchema.nullable(),
      }),
    ])
    .safeParse(input);
  if (!parsed.success) return null;
  const account = token.accountId ?? token.userId;
  const admitted =
    token.role === 'host' ||
    token.scopes.includes('meet:workspace-member') ||
    !!snapshot.approved?.[account] ||
    Object.values(snapshot.presence).some(
      (p) => (p.accountId ?? p.userId) === account
    );
  if (
    !admitted ||
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
      body: { selection: snapshot.settings?.programming ?? null },
    };
  const state = {
    ...snapshot,
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
