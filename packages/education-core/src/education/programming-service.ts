import type { ProgrammingProblemInput } from '@tuturuuu/types/primitives/programming';
import {
  authorProgrammingProblem,
  type ProgrammingCaseRow,
  ProgrammingError,
  type ProgrammingProblemRow,
  publicProgrammingProblem,
} from './programming-model';
import {
  ProgrammingProblemEditSchema,
  ProgrammingProblemInputSchema,
} from './programming-schema';

/** Construct only after the app-session access helper succeeds. Never from JSON. */
export interface ProgrammingAccess {
  wsId: string;
  actorId: string;
  mode: 'learner' | 'author';
}

export interface ProgrammingRepository {
  list(scope: {
    wsId: string;
    publishedOnly: boolean;
  }): Promise<ProgrammingProblemRow[]>;
  find(scope: {
    wsId: string;
    id: string;
    publishedOnly: boolean;
  }): Promise<ProgrammingProblemRow | null>;
  /** One consistent database snapshot, never separate row/case requests. */
  snapshot(scope: {
    wsId: string;
    id: string;
    publishedOnly: boolean;
    author: boolean;
  }): Promise<{
    problem: ProgrammingProblemRow;
    cases: ProgrammingCaseRow[];
  } | null>;
  /** Adapter must use one private transaction for row and case replacement. */
  write(input: {
    wsId: string;
    actorId: string;
    problem: ProgrammingProblemInput;
    id?: string;
    expectedRevision?: number;
  }): Promise<ProgrammingProblemRow>;
}

function assertScoped(
  problem: ProgrammingProblemRow,
  access: ProgrammingAccess
) {
  if (problem.ws_id !== null && problem.ws_id !== access.wsId) {
    throw new ProgrammingError('Problem not found', 404);
  }
  if (
    (access.mode === 'learner' || problem.ws_id === null) &&
    problem.status !== 'published'
  ) {
    throw new ProgrammingError('Problem not found', 404);
  }
}

export async function listProgrammingProblems(
  repository: ProgrammingRepository,
  access: ProgrammingAccess
) {
  const rows = await repository.list({
    wsId: access.wsId,
    publishedOnly: access.mode === 'learner',
  });
  // Recheck the adapter boundary before returning any data, including summaries.
  return rows.map((row) => {
    assertScoped(row, access);
    const {
      prompt: _prompt,
      starterCode: _starter,
      publicCases: _cases,
      ...summary
    } = publicProgrammingProblem(row, [], access.mode === 'author');
    return summary;
  });
}

export async function getProgrammingProblem(
  repository: ProgrammingRepository,
  access: ProgrammingAccess,
  id: string
) {
  const snapshot = await repository.snapshot({
    wsId: access.wsId,
    id,
    publishedOnly: access.mode === 'learner',
    author: access.mode === 'author',
  });
  if (!snapshot || snapshot.problem.id !== id)
    throw new ProgrammingError('Problem not found', 404);
  const { problem: row, cases } = snapshot;
  assertScoped(row, access);
  if (cases.some((entry) => entry.problem_id !== row.id)) {
    throw new ProgrammingError('Failed to load problem cases', 500);
  }
  return access.mode === 'author'
    ? authorProgrammingProblem(row, cases)
    : publicProgrammingProblem(row, cases, false);
}

export async function createProgrammingProblem(
  repository: ProgrammingRepository,
  access: ProgrammingAccess,
  payload: unknown
) {
  if (access.mode !== 'author')
    throw new ProgrammingError('Insufficient permissions', 403);
  const parsed = ProgrammingProblemInputSchema.safeParse(payload);
  if (!parsed.success)
    throw new ProgrammingError('Invalid problem payload', 400);
  const row = await repository.write({
    wsId: access.wsId,
    actorId: access.actorId,
    problem: parsed.data,
  });
  assertScoped(row, access);
  if (row.ws_id !== access.wsId)
    throw new ProgrammingError('Invalid stored workspace', 500);
  return { id: row.id, revision: row.revision };
}

export async function editProgrammingProblem(
  repository: ProgrammingRepository,
  access: ProgrammingAccess,
  id: string,
  payload: unknown
) {
  if (access.mode !== 'author')
    throw new ProgrammingError('Insufficient permissions', 403);
  const parsed = ProgrammingProblemEditSchema.safeParse(payload);
  if (!parsed.success)
    throw new ProgrammingError('Invalid problem payload', 400);
  const current = await repository.find({
    wsId: access.wsId,
    id,
    publishedOnly: false,
  });
  if (!current || current.id !== id)
    throw new ProgrammingError('Problem not found', 404);
  assertScoped(current, access);
  if (current.ws_id === null)
    throw new ProgrammingError('Platform catalog is read only', 403);
  const { expectedRevision, ...problem } = parsed.data;
  // Adapter must enforce revision again transactionally; this lookup is not a lock.
  const row = await repository.write({
    wsId: access.wsId,
    actorId: access.actorId,
    id,
    expectedRevision,
    problem,
  });
  if (row.id !== id || row.ws_id !== access.wsId)
    throw new ProgrammingError('Invalid stored problem', 500);
  return { id: row.id, revision: row.revision };
}
