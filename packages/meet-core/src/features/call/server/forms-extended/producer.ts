import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { runUntypedRpc } from '../../../../../../../apps/forms/src/features/forms/server/client';
import { MeetCallAccessError } from '../../lib/call-access';
import {
  type FormAccess,
  readWorkspaceForm,
  submissionPolicy,
} from '../forms/policy';
import { readBoundedFormData } from '../read-upload';
import { callRoomService } from '../room-service';
import {
  FORM_RESPONDENT_UPLOAD_BUCKET,
  FORM_UPLOAD_MAX_BYTES,
  FORM_UPLOAD_MIME_TYPES,
  formPublishedDefinitionSchema,
  formRespondentUploadKey,
  publishedFormIdSchema,
} from './forms-source';
import { readExtendedFormPublication } from './operations';
import { deriveExtendedFormRespondentScope } from './respondent-scope';
import { createExtendedFormsStore } from './store';

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

export function extendedFormContext(access: FormAccess) {
  return { meetingId: access.meeting.id, wsId: access.meeting.ws_id };
}

export async function requireOpenFormPublication(
  access: FormAccess,
  launchId: string
) {
  const context = extendedFormContext(access);
  const result = await readExtendedFormPublication(
    context,
    launchId,
    await createExtendedFormsStore(access)
  );
  if (result.status === 'closed')
    throw new MeetCallAccessError(410, 'Form is closed');
  if (result.status === 'not_found')
    throw new MeetCallAccessError(404, 'Form launch not found');
  return result.publication;
}

export async function launchPublishedForm(access: FormAccess, input: unknown) {
  const formStore = await createExtendedFormsStore(access);
  await formStore.requireManager();
  const scope = {
    ...z
      .strictObject({
        formId: publishedFormIdSchema,
        versionId: publishedFormIdSchema,
      })
      .parse(input),
    wsId: access.meeting.ws_id,
  };
  const parsed = formPublishedDefinitionSchema.safeParse(
    await formStore.readPublication(scope)
  );
  if (
    !parsed.success ||
    parsed.data.id !== scope.formId ||
    parsed.data.wsId !== scope.wsId
  )
    throw new MeetCallAccessError(404, 'Form publication not found');
  const db = await createAdminClient({ noCookie: true });
  const current = await readWorkspaceForm(db, scope.wsId, scope.formId);
  if (!submissionPolicy(parsed.data, current).acceptingResponses)
    throw new MeetCallAccessError(410, 'Form is closed');
  const launch = {
    launchId: crypto.randomUUID(),
    formId: scope.formId,
    versionId: scope.versionId,
    form: { id: scope.formId, wsId: scope.wsId },
    publication: true,
  };
  return callRoomService(access, { action: 'forms.launch', launch });
}

async function uploadFile(
  admin: Admin,
  reservation: {
    id: string;
    ws_id: string;
    form_id: string;
    version_id: string;
    launch_id: string;
    meeting_id: string;
    question_id: string;
    actor_scope: string;
    content_type: string;
    size_bytes: number;
    content_sha256: string;
  },
  bytes: ArrayBuffer
) {
  const outcome = z.object({ kind: z.string() }).parse(
    await runUntypedRpc(admin, 'start_meet_form_upload', {
      p_upload: reservation,
    })
  );
  if (outcome.kind === 'closed')
    throw new MeetCallAccessError(410, 'Form is closed');
  if (outcome.kind === 'limit')
    throw new MeetCallAccessError(409, 'Form upload limit reached');
  if (outcome.kind !== 'write')
    throw new MeetCallAccessError(409, 'Form upload is unavailable');

  // A reservation grants exactly one server write. No client write URL exists.
  // A transport failure is not a receipt and must leave the write unsealed.
  const { error } = await admin.storage
    .from(FORM_RESPONDENT_UPLOAD_BUCKET)
    .upload(formRespondentUploadKey(reservation), bytes, {
      contentType: reservation.content_type,
      upsert: false,
    });
  const settle = (stored: boolean) =>
    runUntypedRpc(admin, 'finish_meet_form_upload', {
      p_upload: reservation,
      p_stored: stored,
    });
  if (error) {
    const status = String(
      ('status' in error ? error.status : undefined) ??
        ('statusCode' in error ? error.statusCode : '')
    );
    if (['400', '401', '403', '413', '415', '422'].includes(status))
      await settle(false);
    throw new MeetCallAccessError(503, 'Form upload could not be confirmed');
  }
  if ((await settle(true)) !== true)
    throw new MeetCallAccessError(409, 'Form upload reservation expired');
  return { uploadId: reservation.id };
}

export async function uploadMeetFormAnswer(
  access: FormAccess,
  launchId: string,
  request: Request
) {
  const { form, formId, versionId } = await requireOpenFormPublication(
    access,
    launchId
  );
  const body = await readBoundedFormData(
    request,
    FORM_UPLOAD_MAX_BYTES + 65536
  );
  const questionId = publishedFormIdSchema.parse(body.get('questionId'));
  const question = form.sections
    .flatMap((section) => section.questions)
    .find((item) => item.id === questionId);
  const file = body.get('file');
  if (question?.type !== 'file_upload' || !(file instanceof File) || !file.size)
    throw new MeetCallAccessError(400, 'Invalid form upload');
  if (file.size > question.maxBytes)
    throw new MeetCallAccessError(413, 'Upload exceeds the size limit');
  const contentType = z.enum(FORM_UPLOAD_MIME_TYPES).parse(file.type);
  if (!question.acceptedMimeTypes.includes(contentType))
    throw new MeetCallAccessError(
      400,
      'File type is unavailable for this question'
    );
  const bytes = await file.arrayBuffer();
  const current = await requireOpenFormPublication(access, launchId);
  if (current.formId !== formId || current.versionId !== versionId)
    throw new MeetCallAccessError(409, 'Form launch changed');
  const wsId = access.meeting.ws_id;
  return uploadFile(
    await createAdminClient({
      noCookie: true,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(45_000) }),
    }),
    {
      id: crypto.randomUUID(),
      ws_id: wsId,
      form_id: formId,
      version_id: versionId,
      launch_id: launchId,
      meeting_id: access.meeting.id,
      question_id: questionId,
      actor_scope: deriveExtendedFormRespondentScope({
        wsId,
        formId,
        actorId: access.user.id,
      }),
      content_type: contentType,
      size_bytes: file.size,
      content_sha256: createHash('sha256')
        .update(new Uint8Array(bytes))
        .digest('hex'),
    },
    bytes
  );
}
