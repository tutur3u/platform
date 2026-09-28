'use server';

import { resolveCodingSubject } from '@/lib/coding/access';
import { getCodingChallenge } from '@/lib/coding/challenges';
import { isCodingLanguage } from '@/lib/coding/languages';
import {
  enqueueCodingSubmission,
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
  source: string
) {
  const subject = await requireCodingLearner(wsId, studentId);
  const challenge = getCodingChallenge(challengeSlug);
  if (!challenge) throw new Error('Challenge not found.');
  if (!isCodingLanguage(language)) throw new Error('Unsupported language.');
  if (!source.trim() || source.length > 16_000) {
    throw new Error('Code must be between 1 and 16,000 characters.');
  }
  return enqueueCodingSubmission({
    challenge,
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
  const subject = await requireCodingLearner(wsId, studentId);
  if (!/^[0-9a-f-]{36}$/iu.test(submissionId)) return null;
  return readCodingSubmission({
    id: submissionId,
    userId: subject.studentPlatformUserId,
    wsId: subject.wsId,
  });
}
