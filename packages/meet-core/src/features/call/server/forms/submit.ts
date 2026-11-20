import 'server-only';

import { z } from 'zod';
import { MeetCallAccessError } from '../../lib/call-access';
import {
  FORM_RESPONSE_ANSWER_MAX_LENGTH,
  type FormDefinition,
  formSubmitSchema,
  getReachableQuestionIds,
  normalizeMarkdownToText,
  serializeAnswerForStorage,
  validateSubmittedAnswers,
} from './forms-source';
import { getParticipantLaunch, launchReferenceSchema } from './launches';
import type { FormAccess } from './policy';
import { createMeetFormsAdmin } from './forms-rpc';
import {
  meetFormRespondentKey,
  meetFormResponseIdentity,
} from './response-ids';
import { formChallenge, verifyFormSubmissionGate } from './submission-proof';

export const submitFormRequestSchema = launchReferenceSchema.extend({
  submissionId: z.uuid(),
  answers: formSubmitSchema.shape.answers,
  turnstileToken: formSubmitSchema.shape.turnstileToken,
});

type AnswerMap = z.output<typeof formSubmitSchema>['answers'];

export function readSubmittedAnswers(form: FormDefinition, input: AnswerMap) {
  const reachable = new Set(getReachableQuestionIds(form, input));
  const answers: AnswerMap = Object.fromEntries(
    Object.entries(input).filter(
      ([questionId, value]) =>
        reachable.has(questionId) &&
        value != null &&
        value !== '' &&
        (!Array.isArray(value) || value.length > 0)
    )
  );
  for (const value of Object.values(answers)) {
    const values = Array.isArray(value) ? value : [value];
    if (
      values.length > 120 ||
      values.some(
        (entry) =>
          typeof entry === 'string' &&
          entry.length > FORM_RESPONSE_ANSWER_MAX_LENGTH
      )
    ) {
      throw new MeetCallAccessError(400, 'An answer is too large');
    }
  }
  return { answers, validation: validateSubmittedAnswers(form, answers) };
}

const commitResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('submitted'),
    response_id: z.uuid(),
    replayed: z.boolean(),
  }),
  z.object({
    kind: z.enum([
      'not_found',
      'invalid',
      'conflict',
      'closed',
      'limit',
      'policy_changed',
    ]),
  }),
]);

export async function submitMeetForm(
  access: FormAccess,
  launchId: string,
  input: z.output<typeof submitFormRequestSchema>,
  request: Request
) {
  const db = await createMeetFormsAdmin();
  const { launch, policy, account, policyRevision } =
    await getParticipantLaunch(access, db, launchId, input);
  const { formId, versionId, form } = launch;
  const { answers, validation } = readSubmittedAnswers(form, input.answers);
  if (!validation.valid) return Response.json(validation, { status: 400 });

  const metadata = {
    meetRoomId: access.meeting.id,
    meetLaunchId: launchId,
    meetVersionId: versionId,
  };
  const { sessionId, sessionToken } = meetFormResponseIdentity({
    meetingId: access.meeting.id,
    launchId,
    formId,
    versionId,
    actorId: access.user.id,
    submissionId: input.submissionId,
    answers,
  });
  const result = {
    kind: 'submitted',
    launchId,
    formId,
    versionId,
    responseId: sessionId,
  } as const;
  const { data: committed, error: readError } = await db
    .schema('private')
    .from('form_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('form_id', formId)
    .contains('metadata', { ...metadata, responseCommitment: sessionToken })
    .not('submitted_at', 'is', null)
    .maybeSingle();
  if (readError)
    throw new MeetCallAccessError(503, 'Form submission status unavailable');
  if (committed) return result;

  const challenge = policy.requireTurnstile
    ? formChallenge(access.meeting, launch, policyRevision)
    : null;
  const proof = await verifyFormSubmissionGate(
    request,
    challenge,
    input.turnstileToken
  );

  const answerRows = form.sections.flatMap((section) =>
    section.questions.flatMap((question) => {
      const value = answers[question.id];
      if (value == null) return [];
      return [
        {
          question_id: question.id,
          question_title:
            normalizeMarkdownToText(question.title) || 'Untitled question',
          question_type: question.type,
          ...serializeAnswerForStorage(value),
        },
      ];
    })
  );
  const { data, error } = await db.rpc('commit_form_response', {
    p_submission: {
      ws_id: access.meeting.ws_id,
      form_id: formId,
      session_id: sessionId,
      commitment: sessionToken,
      policy_revision: policyRevision,
      proof,
      access_mode: policy.accessMode,
      respondent_user_id: account?.id ?? null,
      respondent_email:
        policy.accessMode === 'authenticated_email'
          ? (account?.email ?? null)
          : null,
      respondent_key:
        policy.accessMode === 'anonymous'
          ? meetFormRespondentKey(formId, access.user.id)
          : null,
      snapshot_max_responses: form.maxResponses ?? null,
      snapshot_open_at: form.openAt ?? null,
      snapshot_close_at: form.closeAt ?? null,
      snapshot_once:
        !form.settings.allowMultipleSubmissions ||
        form.settings.oneResponsePerUser,
      metadata,
      answers: answerRows,
    },
  });
  const parsed = commitResultSchema.safeParse(data);
  if (error || !parsed.success)
    throw new MeetCallAccessError(
      503,
      'Form submission could not be confirmed'
    );
  switch (parsed.data.kind) {
    case 'submitted':
      return { ...result, responseId: parsed.data.response_id };
    case 'not_found':
      throw new MeetCallAccessError(404, 'Form session not found');
    case 'invalid':
      throw new MeetCallAccessError(400, 'Invalid form submission');
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
  }
}
