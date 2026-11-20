import { createHash, createHmac } from 'node:crypto';

function toUuid(hex: string) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function scopedHmac(purpose: string, fields: readonly string[]) {
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === 'production')
    throw new Error('Meet form responses require MEET_REALTIME_TOKEN_SECRET');
  return createHmac('sha256', secret || 'meet-local-development-token-secret')
    .update(JSON.stringify(['meet-forms', purpose, ...fields]))
    .digest('hex');
}

export function meetFormResponseIdentity(input: {
  meetingId: string;
  launchId: string;
  formId: string;
  versionId: string;
  actorId: string;
  submissionId: string;
  answers: Record<string, unknown>;
}) {
  const scope = [
    input.meetingId,
    input.launchId,
    input.formId,
    input.versionId,
    input.actorId,
    input.submissionId,
  ];
  const canonicalAnswers = JSON.stringify(
    Object.entries(input.answers).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
  return {
    sessionId: toUuid(scopedHmac('session', scope)),
    sessionToken: scopedHmac('answer-commitment', [...scope, canonicalAnswers]),
  };
}

export function meetFormRespondentKey(formId: string, actorId: string) {
  return scopedHmac('respondent', [formId, actorId]);
}

export function meetFormCreationCommitment(definition: string) {
  return scopedHmac('creation', [definition]);
}

export function meetFormAnswerId(responseId: string, questionId: string) {
  return toUuid(
    createHash('sha256')
      .update(JSON.stringify(['meet-forms-answer', responseId, questionId]))
      .digest('hex')
  );
}
