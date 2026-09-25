'use server';

import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  decodeRoomCode,
  encodeRoomCode,
} from '@tuturuuu/meet-core/features/call/lib/room-code';
import { personalWorkspace } from '@tuturuuu/meet-core/features/call/server/room-service';
import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import { observationSchema } from '@tuturuuu/meet-core/parley/contracts';
import { parleyDatabase } from '@tuturuuu/meet-core/parley/database';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export async function startScenario(form: FormData) {
  const user = await requireParleyUser();
  const id = z.uuid().parse(form.get('scenario_id'));
  if (form.get('consent') !== 'on')
    throw new Error('Participation acknowledgement required');
  const wsId = await personalWorkspace(user.id);
  const { data, error } = await (await parleyDatabase()).rpc(
    'create_parley_session',
    { p_scenario_id: id, p_user_id: user.id, p_ws_id: wsId }
  );
  if (error || !data) throw new Error('Could not start scenario');
  redirect(`/r/${encodeRoomCode(data)}`);
}
export async function saveObservation(form: FormData) {
  const user = await requireParleyUser();
  const meetingId = z.uuid().parse(form.get('meeting_id'));
  const access = await getMeetCallAccess(meetingId, 'Participant');
  if (!access.isHost)
    throw new Error('Only the facilitator can save research notes');
  const input = observationSchema.parse({
    kind: form.get('kind'),
    content: form.get('content'),
  });
  const { error } = await (await parleyDatabase())
    .schema('private')
    .from('parley_observations')
    .insert({ ...input, meeting_id: meetingId, author_id: user.id });
  if (error) throw new Error('Could not save observation');
  revalidatePath(`/r/${encodeRoomCode(meetingId)}`);
  revalidatePath(`/sessions/${meetingId}`);
}
export async function joinScenario(form: FormData) {
  await requireParleyUser();
  const input = String(form.get('code') ?? '').trim();
  const id = decodeRoomCode(input);
  if (!id) throw new Error('Invalid room code');
  redirect(`/r/${encodeRoomCode(id)}`);
}
