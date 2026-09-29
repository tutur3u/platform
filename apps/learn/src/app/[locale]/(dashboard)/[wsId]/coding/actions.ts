'use server';

import { resolveCodingSubject } from '@/lib/coding/access';
import { getCodingChallenge } from '@/lib/coding/challenges';
import { isCodingLanguage } from '@/lib/coding/languages';
import type { CodingExecutionKind } from '@/lib/coding/results';
import {
  enqueueCodingExecution,
  listCodingExecutions as listStoredCodingExecutions,
  readCodingSubmission,
} from '@/lib/coding/store';

async function requireCodingLearner(wsId: string, studentId?: string) {
  const subject = await resolveCodingSubject(wsId, studentId);
  if (subject.readOnly) throw new Error('This learner is read only.');
  return subject;
}

export async function submitCodingSolution(
  wsId: string,
  studentId: string | undefined,
  challengeSlug: string,
  language: string,
  source: string,
  kind: CodingExecutionKind = 'submit',
  customCase?: { input: string; expected: string }
) {
  const subject = await requireCodingLearner(wsId, studentId);
  const challenge = getCodingChallenge(challengeSlug);
  if (!challenge) throw new Error('Challenge not found.');
  if (!isCodingLanguage(language)) throw new Error('Unsupported language.');
  if (!source.trim() || source.length > 16_000) {
    throw new Error('Code must be between 1 and 16,000 characters.');
  }
  if (kind !== 'submit' && kind !== 'test') {
    throw new Error('Invalid execution kind.');
  }
  if (
    customCase &&
    (typeof customCase.input !== 'string' ||
      typeof customCase.expected !== 'string')
  ) {
    throw new Error('Invalid custom test case.');
  }
  return enqueueCodingExecution({
    challenge,
    customCase,
    kind,
    language,
    source,
    userId: subject.studentPlatformUserId,
    wsId: subject.wsId,
  });
}

export async function getCodingSubmission(
  wsId: string,
  studentId: string | undefined,
  submissionId: string
) {
  const subject = await resolveCodingSubject(wsId, studentId);
  if (!/^[0-9a-f-]{36}$/iu.test(submissionId)) return null;
  return readCodingSubmission({
    id: submissionId,
    userId: subject.studentPlatformUserId,
    wsId: subject.wsId,
  });
}

export async function listCodingExecutions(
  wsId: string,
  studentId: string | undefined,
  challengeSlug: string,
  before?: string
) {
  const subject = await resolveCodingSubject(wsId, studentId);
  if (!getCodingChallenge(challengeSlug)) {
    throw new Error('Challenge not found.');
  }
  if (before && !/^[^|(),]+\|[0-9a-f-]{36}$/iu.test(before)) {
    throw new Error('Invalid history cursor.');
  }
  return listStoredCodingExecutions({
    before,
    challengeSlug,
    userId: subject.studentPlatformUserId,
    wsId: subject.wsId,
  });
}
