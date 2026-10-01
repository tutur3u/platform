'use server';
import { enqueueProgrammingExecution } from '@tuturuuu/education-core/education/programming-execution';
import { ProgrammingError } from '@tuturuuu/education-core/education/programming-model';
import { ProgrammingProblemId } from '@tuturuuu/education-core/education/programming-schema';
import { getProgrammingProblem } from '@tuturuuu/internal-api/education';
import type { CodingExecutionKind } from '@/lib/coding/results';
import {
  listCodingExecutions,
  notifyProgrammingSubmission,
  readCodingSubmission,
} from '@/lib/coding/store';
import {
  programmingApiOptions,
  programmingLearnerScope,
} from '@/lib/programming/server';

export async function submitProgrammingSolution(
  wsId: string,
  studentId: string | undefined,
  problemId: string,
  language: string,
  source: string,
  kind: CodingExecutionKind,
  customCase?: { input: string; expected: string }
) {
  return safeProgrammingAction(async () => {
    const { context, subject } = await programmingLearnerScope(wsId, studentId);
    const id = await enqueueProgrammingExecution(context, wsId, studentId, {
      problemId,
      language,
      source,
      kind,
      customCase,
    });
    await notifyProgrammingSubmission({
      id,
      problemId,
      wsId: subject.wsId,
      userId: subject.studentPlatformUserId,
    });
    return id;
  });
}
export async function getProgrammingSubmission(
  wsId: string,
  studentId: string | undefined,
  problemId: string,
  submissionId: string
) {
  return safeProgrammingAction(async () => {
    const { subject } = await programmingLearnerScope(wsId, studentId);
    ProgrammingProblemId.parse(problemId);
    ProgrammingProblemId.parse(submissionId);
    await getProgrammingProblem(
      subject.wsId,
      problemId,
      studentId,
      await programmingApiOptions()
    );
    return readCodingSubmission({
      id: submissionId,
      problemId,
      wsId: subject.wsId,
      userId: subject.studentPlatformUserId,
    });
  });
}
export async function listProgrammingExecutions(
  wsId: string,
  studentId: string | undefined,
  problemId: string,
  before?: string
) {
  return safeProgrammingAction(async () => {
    const { subject } = await programmingLearnerScope(wsId, studentId);
    ProgrammingProblemId.parse(problemId);
    const { problem } = await getProgrammingProblem(
      subject.wsId,
      problemId,
      studentId,
      await programmingApiOptions()
    );
    return listCodingExecutions({
      before,
      problemId,
      challengeSlug: problem.slug,
      userId: subject.studentPlatformUserId,
      wsId: subject.wsId,
    });
  });
}

export async function saveProgrammingProblem(
  wsId: string,
  problemId: string | undefined,
  expectedRevision: number | undefined,
  payload: unknown
): Promise<
  { ok: true; id: string; revision: number } | { ok: false; status: number }
> {
  const { ProgrammingProblemInputSchema } = await import(
    '@tuturuuu/education-core/education/programming-schema'
  );
  const { createProgrammingProblem, editProgrammingProblem } = await import(
    '@tuturuuu/internal-api/education'
  );
  const { InternalApiError } = await import('@tuturuuu/internal-api');
  const parsed = ProgrammingProblemInputSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, status: 400 };
  try {
    const options = await programmingApiOptions();
    const saved = problemId
      ? await editProgrammingProblem(
          wsId,
          problemId,
          { ...parsed.data, expectedRevision: expectedRevision ?? 0 },
          options
        )
      : await createProgrammingProblem(wsId, parsed.data, options);
    return { ok: true, ...saved };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof InternalApiError ? error.status : 500,
    };
  }
}

async function safeProgrammingAction<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ProgrammingError) throw error;
    // Session/access/SQL/internal transport errors can carry private diagnostics.
    throw new Error('Programming request failed. Refresh and try again.');
  }
}
