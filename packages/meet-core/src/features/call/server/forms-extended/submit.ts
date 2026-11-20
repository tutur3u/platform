import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { serializeAnswerForStorage } from '../../../../../../../apps/forms/src/features/forms/server/answers';
import { runUntypedRpc } from '../../../../../../../apps/forms/src/features/forms/server/client';
import { normalizeMarkdownToText } from '../../../../../../../apps/forms/src/features/forms/content';
import { validatePublishedFormAnswers } from '../../../../../../../apps/forms/src/features/forms/published-validation';
import { MeetCallAccessError } from '../../lib/call-access';
import {
  type FormAccess,
  getVerifiedFormAccount,
  readWorkspaceForm,
  submissionPolicy,
} from '../forms/policy';
import {
  meetFormRespondentKey,
  meetFormResponseIdentity,
} from '../forms/response-ids';
import {
  formChallenge,
  verifyFormSubmissionGate,
} from '../forms/submission-proof';
import {
  formPublishedDefinitionSchema,
  publishedFormIdSchema,
} from './forms-source';
import { requireOpenFormPublication } from './producer';
import { deriveExtendedFormRespondentScope } from './respondent-scope';

const submitInput = z.strictObject({
  submissionId: z.uuid(),
  versionId: publishedFormIdSchema,
  answers: z.unknown(),
  turnstileToken: z.string().max(2048).optional(),
});
const resultSchema = z.object({
  kind: z.string(),
  response_id: z.uuid().optional(),
});

type PublishedForm = z.output<typeof formPublishedDefinitionSchema>;

export function extendedFormResponsePolicy(
  meeting: FormAccess['meeting'],
  publication: {
    launchId: string;
    formId: string;
    versionId: string;
    form: PublishedForm;
  },
  current: Awaited<ReturnType<typeof readWorkspaceForm>>
) {
  const policy = submissionPolicy(publication.form, current);
  if (!policy.acceptingResponses)
    throw new MeetCallAccessError(410, 'Form is closed');
  return {
    policy,
    challenge: policy.requireTurnstile
      ? formChallenge(meeting, publication, current.updated_at)
      : null,
  };
}

export async function submitPublishedMeetForm(
  access: FormAccess,
  launchId: string,
  input: unknown,
  request: Request
) {
  const parsed = submitInput.parse(input);
  const publication = await requireOpenFormPublication(access, launchId);
  const { form, formId, versionId } = publication;
  if (parsed.versionId !== versionId)
    throw new MeetCallAccessError(404, 'Form launch not found');
  const validated = validatePublishedFormAnswers(form, parsed.answers);
  if (!validated.valid) return Response.json(validated, { status: 400 });

  const db = await createAdminClient({ noCookie: true });
  const { id: meetingId, ws_id: wsId } = access.meeting;
  const current = await readWorkspaceForm(db, wsId, formId);
  const { policy, challenge } = extendedFormResponsePolicy(
    access.meeting,
    publication,
    current
  );
  const actorId = access.user.id;
  const account =
    policy.accessMode === 'anonymous'
      ? null
      : await getVerifiedFormAccount(access, db);
  if (policy.accessMode !== 'anonymous' && !account)
    throw new MeetCallAccessError(403, 'Form account is required');
  if (policy.accessMode === 'authenticated_email' && !account?.email)
    throw new MeetCallAccessError(403, 'Confirmed email is required');
  const metadata = {
    meetRoomId: meetingId,
    meetLaunchId: launchId,
    meetVersionId: versionId,
    meetUploadActorScope: deriveExtendedFormRespondentScope({
      wsId,
      formId,
      actorId,
    }),
  };
  const { sessionId, sessionToken } = meetFormResponseIdentity({
    meetingId,
    launchId,
    formId,
    versionId,
    actorId,
    submissionId: parsed.submissionId,
    answers: validated.answers,
  });
  const result = {
    kind: 'submitted',
    launchId,
    formId,
    versionId,
    responseId: sessionId,
  } as const;
  const existing = await db
    .schema('private')
    .from('form_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('form_id', formId)
    .contains('metadata', { ...metadata, responseCommitment: sessionToken })
    .not('submitted_at', 'is', null)
    .maybeSingle();
  if (existing.error)
    throw new MeetCallAccessError(503, 'Form submission is unavailable');
  if (existing.data) return result;

  const gate = await verifyFormSubmissionGate(
    request,
    challenge,
    parsed.turnstileToken
  );
  const answers = form.sections.flatMap((section) =>
    section.questions.flatMap((question) => {
      const value = validated.answers[question.id];
      if (value == null) return [];
      return [
        {
          question_id: question.id,
          question_title:
            normalizeMarkdownToText(question.title) || 'Untitled question',
          question_type: question.type,
          ...(question.type === 'matrix'
            ? { answer_text: null, answer_json: value }
            : serializeAnswerForStorage(value)),
        },
      ];
    })
  );
  const data = await runUntypedRpc(db, 'commit_meet_published_form_response', {
    p_submission: {
      ws_id: wsId,
      form_id: formId,
      session_id: sessionId,
      commitment: sessionToken,
      policy_revision: current.updated_at,
      proof: gate,
      access_mode: policy.accessMode,
      respondent_user_id: account?.id ?? null,
      respondent_email:
        policy.accessMode === 'authenticated_email'
          ? (account?.email ?? null)
          : null,
      respondent_key:
        policy.accessMode === 'anonymous'
          ? meetFormRespondentKey(formId, actorId)
          : null,
      snapshot_max_responses: form.maxResponses ?? null,
      snapshot_open_at: form.openAt ?? null,
      snapshot_close_at: form.closeAt ?? null,
      snapshot_once:
        !policy.allowMultipleSubmissions || policy.oneResponsePerUser,
      metadata,
      answers,
    },
  });
  const commit = resultSchema.safeParse(data);
  if (!commit.success)
    throw new MeetCallAccessError(
      503,
      'Form submission could not be confirmed'
    );
  switch (commit.data.kind) {
    case 'submitted':
      if (commit.data.response_id === result.responseId) return result;
      throw new MeetCallAccessError(
        503,
        'Form submission could not be confirmed'
      );
    case 'invalid':
      throw new MeetCallAccessError(400, 'Invalid form submission');
    case 'not_found':
      throw new MeetCallAccessError(
        404,
        'A form upload or launch was not found'
      );
    case 'closed':
      throw new MeetCallAccessError(410, 'Form is closed');
    case 'limit':
      throw new MeetCallAccessError(409, 'Form response limit reached');
    case 'conflict':
      throw new MeetCallAccessError(
        409,
        'A different response uses this submission'
      );
    case 'policy_changed':
      throw new MeetCallAccessError(
        409,
        'The form submission policy changed',
        'FORM_POLICY_CHANGED'
      );
    default:
      throw new MeetCallAccessError(
        503,
        'Form submission could not be confirmed'
      );
  }
}
