import type { submitCodingSolution as realSubmitCodingSolution } from '../../src/app/[locale]/(dashboard)/[wsId]/coding/actions';
import { isCodingLanguage } from '../../src/lib/coding/languages';
import type { CodingExecutionSummary } from '../../src/lib/coding/results';

let attempt: Pick<
  CodingExecutionSummary,
  'challengeSlug' | 'language' | 'source' | 'kind'
> | null = null;
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
  ]: Parameters<typeof realSubmitCodingSolution>
) {
  if (!isCodingLanguage(language))
    throw new Error('Unsupported synthetic language');
  syntheticGlobal.__syntheticSubmitCount =
    (syntheticGlobal.__syntheticSubmitCount ?? 0) + 1;
  attempt = { challengeSlug, language, source, kind };
  return '22222222-2222-4222-8222-222222222222';
}
export async function listCodingExecutions() {
  return { items: [], nextCursor: null };
}
export async function getCodingSubmission(): Promise<CodingExecutionSummary> {
  if (!attempt) throw new Error('No synthetic attempt');
  return {
    id: '22222222-2222-4222-8222-222222222222',
    ...attempt,
    createdAt: new Date().toISOString(),
    status: 'succeeded',
    result: {
      passed: 2,
      total: 2,
      hiddenPassed: 0,
      hiddenTotal: 0,
      medianDurationMs: 3,
      timingRangeMs: [2, 4],
      results: [
        {
          index: 0,
          visible: true,
          passed: true,
          reason: 'passed',
          durationMs: 3,
          output: '0 1\n',
        },
      ],
    },
  };
}
