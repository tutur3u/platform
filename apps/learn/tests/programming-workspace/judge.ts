let attempt: any = null;
export async function submitCodingSolution(
  _ws: any,
  _student: any,
  challenge: any,
  language: any,
  source: any,
  kind: any
) {
  globalThis.__syntheticSubmitCount =
    (globalThis.__syntheticSubmitCount ?? 0) + 1;
  attempt = { challenge, language, source, kind };
  return '22222222-2222-4222-8222-222222222222';
}
export async function listCodingExecutions() {
  return { items: [], nextCursor: null };
}
export async function getCodingSubmission() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    challengeSlug: attempt.challenge,
    language: attempt.language,
    source: attempt.source,
    kind: attempt.kind,
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
