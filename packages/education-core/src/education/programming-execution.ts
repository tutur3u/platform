import 'server-only';
import { z } from 'zod';
import type { EducationAuthContext } from '../types';
import { resolveProgrammingLearnerAccess } from './programming-access';
import {
  type ProgrammingCaseRow,
  ProgrammingError,
  type ProgrammingProblemRow,
} from './programming-model';
import { createPrivateProgrammingTransport } from './programming-repository';
import { ProgrammingProblemId } from './programming-schema';

export const ProgrammingExecutionSchema = z
  .object({
    problemId: ProgrammingProblemId,
    language: z.enum([
      'python',
      'javascript',
      'typescript',
      'c',
      'cpp',
      'java',
      'rust',
      'go',
      'ruby',
      'php',
    ]),
    source: z
      .string()
      .min(1)
      .max(16_000)
      .refine((value) => value.trim().length > 0),
    kind: z.enum(['test', 'submit']),
    customCase: z
      .object({ input: z.string().max(4096), expected: z.string().max(4096) })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => !value.customCase || value.kind === 'test', {
    message: 'Custom cases require test mode',
  });

/** The return value is an opaque submission id, never private case data. */
export async function enqueueProgrammingExecution(
  context: EducationAuthContext,
  wsId: string,
  studentId: string | undefined,
  payload: unknown
) {
  const subject = await resolveProgrammingLearnerAccess({
    context,
    wsId,
    studentId,
  });
  if (subject.readOnly)
    throw new ProgrammingError('This learner is read only', 403);
  const parsed = ProgrammingExecutionSchema.safeParse(payload);
  if (!parsed.success)
    throw new ProgrammingError('Invalid execution payload', 400);
  const { problemId, source, kind, language, customCase } = parsed.data;
  const client = await createPrivateProgrammingTransport();
  const snapshot = await client.rpc<{
    problem: ProgrammingProblemRow;
    cases: ProgrammingCaseRow[];
  }>('read_learn_programming_execution', {
    p_ws_id: subject.wsId,
    p_problem_id: problemId,
  });
  if (snapshot.error)
    throw new ProgrammingError('Failed to load execution problem', 500);
  if (
    !snapshot.data ||
    snapshot.data.problem.id !== problemId ||
    snapshot.data.problem.status !== 'published' ||
    (snapshot.data.problem.ws_id !== null &&
      snapshot.data.problem.ws_id !== subject.wsId)
  ) {
    throw new ProgrammingError('Problem not found', 404);
  }
  if (snapshot.data.cases.some((test) => test.problem_id !== problemId))
    throw new ProgrammingError('Invalid execution cases', 500);
  const cases = snapshot.data.cases
    .filter((test) => kind === 'submit' || test.visible)
    .map(({ input, expected, visible }) => ({ input, expected, visible }));
  if (customCase) cases.push({ ...customCase, visible: true });
  if (cases.length < 1 || cases.length > 50)
    throw new ProgrammingError('Invalid execution case count', 400);
  const encoded = Buffer.from(
    JSON.stringify({ cases, language, source })
  ).toString('base64url');
  if (encoded.length > 48_000)
    throw new ProgrammingError('Execution payload exceeds judge limit', 400);
  const result = await client.rpc<string>(
    'enqueue_learn_programming_execution',
    {
      p_ws_id: subject.wsId,
      p_actor_id: context.user.id,
      p_user_id: subject.studentPlatformUserId,
      p_problem_id: problemId,
      p_expected_revision: snapshot.data.problem.revision,
      p_source: source,
      p_command: ['__ttr_judge_v1__', encoded],
      p_language: language,
      p_kind: kind,
    }
  );
  if (result.error || !result.data) {
    if (result.error?.code === '40001')
      throw new ProgrammingError(
        'Problem changed; reload before submitting',
        409
      );
    if (result.error?.code === '42501')
      throw new ProgrammingError('Learner execution is forbidden', 403);
    if (result.error?.code === 'P0002')
      throw new ProgrammingError('Problem not found', 404);
    // Private command/case details must not escape through raw SQL error text.
    throw new ProgrammingError('Could not queue submission', 500);
  }
  return result.data;
}
