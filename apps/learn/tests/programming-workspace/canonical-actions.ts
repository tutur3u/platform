import type { ProgrammingProblemInput } from '@tuturuuu/types/primitives/programming';
import type { saveProgrammingProblem as RealSave } from '../../src/app/[locale]/(dashboard)/[wsId]/programming/actions';
export const state = {
  saveStatus: 200,
  saved: null as ProgrammingProblemInput | null,
  deferred: false,
  resolve: null as (() => void) | null,
};
export async function submitProgrammingSolution() {
  if (state.deferred)
    await new Promise<void>((resolve) => {
      state.resolve = resolve;
    });
  return '22222222-2222-4222-8222-222222222222';
}
export async function getProgrammingSubmission() {
  return null;
}
export async function listProgrammingExecutions() {
  return { items: [], nextCursor: null };
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
