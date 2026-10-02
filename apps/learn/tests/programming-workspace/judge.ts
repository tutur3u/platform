import type {
  getCodingSubmission as realGetCodingSubmission,
  submitCodingSolution as realSubmitCodingSolution,
} from '../../src/app/[locale]/(dashboard)/[wsId]/coding/actions';
import { isCodingLanguage } from '../../src/lib/coding/languages';
import type { CodingExecutionSummary } from '../../src/lib/coding/results';

import {
  syntheticSubmissionId,
  syntheticSubmissionOutput,
} from './synthetic-result';

type SyntheticAttempt = Pick<
  CodingExecutionSummary,
  'challengeSlug' | 'language' | 'source' | 'kind'
> & { customCase?: { input: string; expected: string } };
const attempts = new Map<
  string,
  { ordinal: number; attempt: SyntheticAttempt }
>();
const syntheticGlobal = globalThis as typeof globalThis & {
  __syntheticSubmitCount?: number;
};
export async function submitCodingSolution(
  ...[
    _ws,
    _student,
    challengeSlug,
    language,
    source,
    kind = 'submit',
    customCase,
  ]: Parameters<typeof realSubmitCodingSolution>
) {
  if (!isCodingLanguage(language))
    throw new Error('Unsupported synthetic language');
  syntheticGlobal.__syntheticSubmitCount =
    (syntheticGlobal.__syntheticSubmitCount ?? 0) + 1;
  const ordinal = syntheticGlobal.__syntheticSubmitCount;
  const id = syntheticSubmissionId(ordinal);
  attempts.set(id, {
    ordinal,
    attempt: { challengeSlug, language, source, kind, customCase },
  });
  return id;
}
export async function listCodingExecutions() {
  return { items: [], nextCursor: null };
}
export async function getCodingSubmission(
  ...[_ws, _student, id]: Parameters<typeof realGetCodingSubmission>
): Promise<CodingExecutionSummary> {
  const saved = id ? attempts.get(id) : null;
  if (!saved || !id) throw new Error('No synthetic attempt');
  const { attempt, ordinal } = saved;
  return {
    id,
    ...attempt,
    createdAt: new Date().toISOString(),
    status: 'succeeded',
    result: {
      passed: 1,
      total: 1,
      hiddenPassed: 0,
      hiddenTotal: 0,
      medianDurationMs: 3,
      timingRangeMs: [3, 3],
      results: [
        {
          index: 0,
          visible: true,
          passed: true,
          reason: 'passed',
          durationMs: 3,
          output: syntheticSubmissionOutput({
            ordinal,
            challengeSlug: attempt.challengeSlug,
            kind: attempt.kind,
            output:
              attempt.customCase?.expected ??
              (attempt.challengeSlug === 'binary-search' ? '3\n' : '0 1\n'),
          }),
        },
      ],
    },
  };
}
