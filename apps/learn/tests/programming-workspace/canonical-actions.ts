import type { ProgrammingProblemInput } from '@tuturuuu/types/primitives/programming';
import type {
  getProgrammingSubmission as RealGet,
  listProgrammingExecutions as RealList,
  saveProgrammingProblem as RealSave,
} from '../../src/app/[locale]/(dashboard)/[wsId]/programming/actions';
import type { CodingExecutionSummary } from '../../src/lib/coding/results';
export const state = {
  saveStatus: 200,
  saved: null as ProgrammingProblemInput | null,
  deferred: false,
  historyFixture: false,
  getCalls: [] as Parameters<typeof RealGet>[],
  resolve: null as (() => void) | null,
};
export async function submitProgrammingSolution() {
  if (state.deferred)
    await new Promise<void>((resolve) => {
      state.resolve = resolve;
    });
  return '22222222-2222-4222-8222-222222222222';
}
const olderId = '66666666-6666-4666-8666-666666666666';
const older: CodingExecutionSummary = {
  id: olderId,
  challengeSlug: 'synthetic',
  createdAt: '2026-01-01T00:00:00.000Z',
  kind: 'submit',
  language: 'python',
  source: '# older inspected',
  status: 'succeeded',
  result: {
    passed: 1,
    total: 1,
    hiddenPassed: 0,
    hiddenTotal: 0,
    medianDurationMs: 1,
    timingRangeMs: [1, 1],
    results: [
      {
        index: 0,
        visible: true,
        passed: true,
        reason: 'passed',
        durationMs: 1,
        output: 'older public output',
      },
    ],
  },
};
export async function getProgrammingSubmission(
  ...args: Parameters<typeof RealGet>
): Promise<CodingExecutionSummary | null> {
  state.getCalls.push(args);
  return args[3] === olderId ? older : null;
}
export async function listProgrammingExecutions(
  ...[_ws, _student, _problem, before]: Parameters<typeof RealList>
) {
  if (!state.historyFixture) return { items: [], nextCursor: null };
  return before
    ? { items: [older], nextCursor: null }
    : {
        items: Array.from({ length: 25 }, (_, index) => ({
          ...older,
          id: `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`,
          kind: 'test' as const,
          result: null,
        })),
        nextCursor: `${older.createdAt}|${olderId}`,
      };
}
export async function saveProgrammingProblem(
  ...[_ws, id, _revision, payload]: Parameters<typeof RealSave>
): ReturnType<typeof RealSave> {
  state.saved = payload as ProgrammingProblemInput;
  return state.saveStatus === 200
    ? {
        ok: true,
        id: id ?? '33333333-3333-4333-8333-333333333333',
        revision: 2,
      }
    : { ok: false, status: state.saveStatus };
}
