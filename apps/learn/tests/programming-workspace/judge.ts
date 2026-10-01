import type { submitCodingSolution as realSubmitCodingSolution } from '../../src/app/[locale]/(dashboard)/[wsId]/coding/actions';
import { isCodingLanguage } from '../../src/lib/coding/languages';
import type { CodingExecutionSummary } from '../../src/lib/coding/results';

let attempt:
  | (Pick<
      CodingExecutionSummary,
      'challengeSlug' | 'language' | 'source' | 'kind'
    > & { customCase?: { input: string; expected: string } })
  | null = null;
const syntheticGlobal = globalThis as typeof globalThis & {
  __syntheticSubmitCount?: number;
};
function syntheticId() {
  // Distinct cache keys reproduce real submissions instead of reusing stale data.
  return `22222222-2222-4222-8222-${String(syntheticGlobal.__syntheticSubmitCount ?? 0).padStart(12, '0')}`;
}
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
  attempt = { challengeSlug, language, source, kind, customCase };
  return syntheticId();
}
export async function listCodingExecutions() {
  return { items: [], nextCursor: null };
}
export async function getCodingSubmission(): Promise<CodingExecutionSummary> {
  if (!attempt) throw new Error('No synthetic attempt');
  return {
    id: syntheticId(),
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
          output:
            attempt.customCase?.expected ??
            (attempt.challengeSlug === 'binary-search' ? '3\n' : '0 1\n'),
        },
      ],
    },
  };
}
