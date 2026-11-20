import 'server-only';

import type { Json } from '@tuturuuu/types';
import { z } from 'zod';
import { MeetCallAccessError } from '../../lib/call-access';
import {
  formVersionId,
  MAX_FORM_BODY_BYTES,
  meetFormLaunchSchema,
  prepareInlineDefinition,
} from './definition';
import type { FormStudioInput } from './forms-source';
import type { createMeetFormsAdmin } from './forms-rpc';
import type { FormAccess } from './policy';
import { meetFormCreationCommitment } from './response-ids';

const creationResult = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reserved'),
    createdAt: z.string(),
    formId: z.uuid(),
    launchId: z.uuid(),
  }),
  z.object({
    kind: z.enum(['staged', 'published']),
    launch: meetFormLaunchSchema,
  }),
  z.object({
    kind: z.enum([
      'invalid',
      'not_found',
      'forbidden',
      'conflict',
      'limit',
      'closed',
    ]),
  }),
]);

export async function createInlineLaunch(
  db: Awaited<ReturnType<typeof createMeetFormsAdmin>>,
  access: FormAccess,
  requestId: string,
  definition: FormStudioInput
) {
  const scope = {
    workspace_id: access.meeting.ws_id,
    meeting_id: access.meeting.id,
    actor_id: access.user.id,
    request_id: requestId,
    commitment: meetFormCreationCommitment(JSON.stringify(definition)),
  };
  async function run(
    operation: 'reserve' | 'materialize' | 'finalize',
    value: Json
  ) {
    const { data, error } = await db.rpc('meet_form_creation', {
      p_scope: scope,
      p_operation: operation,
      p_value: value,
    });
    const parsed = creationResult.safeParse(data);
    if (error || !parsed.success)
      throw new MeetCallAccessError(
        503,
        'Form creation could not be confirmed',
        'RETRY_FORM_CREATION'
      );
    switch (parsed.data.kind) {
      case 'staged':
      case 'published':
      case 'reserved':
        return parsed.data;
      case 'invalid':
        throw new MeetCallAccessError(400, 'Invalid form definition');
      case 'forbidden':
        throw new MeetCallAccessError(403, 'Forms permission required');
      case 'not_found':
        throw new MeetCallAccessError(404, 'Form creation intent not found');
      case 'conflict':
        throw new MeetCallAccessError(
          409,
          'Form creation identifier is already in use'
        );
      case 'limit':
        throw new MeetCallAccessError(409, 'Room form creation limit reached');
      case 'closed':
        throw new MeetCallAccessError(409, 'Form is not open for responses');
    }
  }

  const reserved = await run('reserve', null);
  let launch;
  if (reserved.kind === 'reserved') {
    const { formId, launchId, createdAt } = reserved;
    const form = prepareInlineDefinition(definition, {
      id: formId,
      wsId: access.meeting.ws_id,
      creatorId: access.user.id,
      createdAt,
    });
    const candidate = {
      launchId,
      formId,
      versionId: formVersionId(form),
      form,
    };
    if (
      new TextEncoder().encode(JSON.stringify(candidate)).byteLength >
      MAX_FORM_BODY_BYTES
    ) {
      throw new MeetCallAccessError(413, 'Form is too large for Meet');
    }
    const created = await run('materialize', candidate);
    if (created.kind === 'reserved')
      throw new MeetCallAccessError(
        503,
        'Form creation could not be confirmed',
        'RETRY_FORM_CREATION'
      );
    launch = created.launch;
  } else {
    launch = reserved.launch;
  }

  return {
    launch,
    async finalize() {
      const finalized = await run('finalize', null);
      if (finalized.kind !== 'published')
        throw new MeetCallAccessError(
          503,
          'Form publication could not be confirmed',
          'RETRY_FORM_CREATION'
        );
    },
  };
}
