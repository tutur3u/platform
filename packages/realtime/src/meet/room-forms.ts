import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';

const id = z.uuid();
const referenceSchema = z.strictObject({
  launchId: id,
  formId: id,
  versionId: id,
});
const launchSchema = referenceSchema.extend({
  form: z.record(z.string(), z.json()),
  publication: z.literal(true).optional(),
});
const readReference = { launchId: id, publication: z.literal(true).optional() };
const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('forms.authorize') }),
  z.strictObject({ action: z.literal('forms.list') }),
  z.strictObject({ action: z.literal('forms.get'), ...readReference }),
  z.strictObject({
    action: z.literal('forms.results_scope'),
    ...readReference,
  }),
  z.strictObject({ action: z.literal('forms.launch'), launch: launchSchema }),
]);

type RoomFormLaunch = z.infer<typeof launchSchema>;
export type RoomFormsState = {
  formLaunches?: RoomFormLaunch[];
  publishedFormLaunches?: Array<
    RoomFormLaunch & { roomId: string; closed?: true }
  >;
};

export type MeetRoomFormsEnv = {
  MEET_FORMS_ENABLED?: string;
  MEET_FORMS_EXTENDED_ENABLED?: string;
};

const MAX_LAUNCHES = 8;
const MAX_LAUNCH_BYTES = 48 * 1024;

export function applyRoomForms<T extends MeetRoomSnapshot & RoomFormsState>(
  state: T,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  env: MeetRoomFormsEnv
) {
  if (
    !input ||
    typeof input !== 'object' ||
    !('action' in input) ||
    typeof input.action !== 'string' ||
    !input.action.startsWith('forms.')
  ) {
    return null;
  }

  const reply = (body: unknown) => ({ state, body });
  const fail = (status: number, error: string) => ({
    state,
    body: { error },
    status,
  });

  if (
    !token.scopes.includes('meet:server') ||
    token.mode !== 'call' ||
    token.roomId !== `${token.wsId}:${token.meetingId}`
  ) {
    return fail(403, 'Forbidden');
  }
  if (env.MEET_FORMS_ENABLED !== 'true') return fail(404, 'Not found');

  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return fail(400, 'Invalid Forms room action');

  const command = parsed.data;
  const publication =
    command.action === 'forms.launch'
      ? command.launch.publication
      : 'publication' in command && command.publication;
  if (publication && env.MEET_FORMS_EXTENDED_ENABLED !== 'true')
    return fail(404, 'Not found');

  const accountId = token.accountId ?? token.userId;
  const host =
    token.role === 'host' && token.scopes.includes('meet:workspace-member');
  const launches = state.formLaunches ?? [];
  const publications = state.publishedFormLaunches ?? [];
  const requestedLaunch = (launchId: string, publication?: true) => {
    if (publication && state.ended) return fail(409, 'Meeting has ended');
    const launch = publication
      ? publications.find(
          (item) =>
            !item.closed &&
            item.roomId === token.roomId &&
            item.launchId === launchId
        )
      : launches.find((item) => item.launchId === launchId);
    return launch ? reply(launch) : fail(404, 'Form launch not found');
  };
  if (command.action === 'forms.results_scope') {
    if (!host) return fail(403, 'Forbidden');
    return requestedLaunch(command.launchId, command.publication);
  }

  const present = Object.values(state.presence).some(
    (person) => (person.accountId ?? person.userId) === accountId
  );
  if (state.ended) return fail(409, 'Meeting has ended');
  if (!present && !state.approved?.[accountId]) return fail(403, 'Forbidden');

  if (command.action === 'forms.list') return reply({ launches });
  if (command.action === 'forms.get') {
    return requestedLaunch(command.launchId, command.publication);
  }
  if (!host) return fail(403, 'Forbidden');
  if (command.action === 'forms.authorize') return reply({ ok: true });

  const { launch } = command;
  if (launch.form.id !== launch.formId || launch.form.wsId !== token.wsId)
    return fail(403, 'Form is outside the meeting workspace');

  if (
    publications.some(
      (item) => item.launchId === launch.launchId && item.closed
    )
  )
    return fail(409, 'Form launch has ended');
  const existing = [...launches, ...publications].find(
    (item) => item.launchId === launch.launchId
  );
  if (existing)
    return existing.formId === launch.formId &&
      existing.versionId === launch.versionId &&
      existing.publication === launch.publication
      ? reply(existing)
      : fail(409, 'Form launch ID is already in use');

  if (launches.length + publications.length >= MAX_LAUNCHES)
    return fail(409, 'Room form launch limit reached');
  if (
    new TextEncoder().encode(JSON.stringify(launch)).byteLength >
    MAX_LAUNCH_BYTES
  )
    return fail(413, 'Form is too large for Meet');

  if (launch.publication) {
    const bound = { ...launch, roomId: token.roomId };
    return {
      state: { ...state, publishedFormLaunches: [...publications, bound] },
      body: bound,
    };
  }

  return {
    state: { ...state, formLaunches: [...launches, launch] },
    body: launch,
  };
}
