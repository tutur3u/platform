import type {
  ProgrammingAuthorProblem,
  ProgrammingProblem,
  ProgrammingProblemInput,
  ProgrammingProblemSummary,
} from '@tuturuuu/types/primitives/programming';
import {
  encodePathSegment,
  getConfiguredInternalApiBaseUrl,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

function catalogPath(wsId: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/programming/problems`;
}
function webClient(options: InternalApiClientOptions = {}) {
  // These first-class routes live on web, unlike existing satellite Tulearn APIs.
  return getInternalApiClient({
    ...options,
    baseUrl: options.baseUrl ?? getConfiguredInternalApiBaseUrl(),
  });
}
export function programmingQueryKey(scope: {
  actorId: string;
  wsId: string;
  mode: 'learner' | 'author';
  studentId?: string;
  problemId?: string;
  cursor?: string;
}) {
  return [
    'programming',
    scope.actorId,
    scope.wsId,
    scope.mode,
    scope.studentId ?? null,
    scope.problemId ?? null,
    scope.cursor ?? null,
  ] as const;
}
export function listProgrammingProblems(
  wsId: string,
  query: {
    mode?: 'learner' | 'author';
    studentId?: string;
    cursor?: string;
  } = {},
  options?: InternalApiClientOptions
) {
  return webClient(options).json<{
    problems: ProgrammingProblemSummary[];
    nextCursor: string | null;
  }>(catalogPath(wsId), { cache: 'no-store', query });
}
export function getProgrammingProblem(
  wsId: string,
  id: string,
  studentId?: string,
  options?: InternalApiClientOptions
) {
  return webClient(options).json<{ problem: ProgrammingProblem }>(
    `${catalogPath(wsId)}/${encodePathSegment(id)}`,
    { cache: 'no-store', query: { mode: 'learner', studentId } }
  );
}
export function getProgrammingAuthorProblem(
  wsId: string,
  id: string,
  options?: InternalApiClientOptions
) {
  return webClient(options).json<{ problem: ProgrammingAuthorProblem }>(
    `${catalogPath(wsId)}/${encodePathSegment(id)}`,
    { cache: 'no-store', query: { mode: 'author' } }
  );
}
export function createProgrammingProblem(
  wsId: string,
  payload: ProgrammingProblemInput,
  options?: InternalApiClientOptions
) {
  return webClient(options).json<{ id: string; revision: number }>(
    catalogPath(wsId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}
export function editProgrammingProblem(
  wsId: string,
  id: string,
  payload: ProgrammingProblemInput & { expectedRevision: number },
  options?: InternalApiClientOptions
) {
  return webClient(options).json<{ id: string; revision: number }>(
    `${catalogPath(wsId)}/${encodePathSegment(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}
