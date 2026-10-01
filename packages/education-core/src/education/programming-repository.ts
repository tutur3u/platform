import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { PROGRAMMING_CATALOG_PAGE_SIZE } from '@tuturuuu/types/primitives/programming';
import {
  type ProgrammingCaseRow,
  ProgrammingError,
  type ProgrammingProblemRow,
} from './programming-model';
import type { ProgrammingRepository } from './programming-service';

type StorageError = { code?: string; message: string };
type Result<T> = { data: T | null; error: StorageError | null };
type Query = PromiseLike<Result<ProgrammingProblemRow[]>> & {
  gt(column: string, value: string): Query;
  limit(count: number): Query;
  eq(column: string, value: string): Query;
  or(filter: string): Query;
  order(column: string, options?: { ascending: boolean }): Query;
};
/** Private schema is absent from current generated public types. Replace this
 * narrow transport shape only after admitted private-schema type generation. */
export interface PrivateProgrammingTransport {
  from(table: string): { select(columns: string): Query };
  rpc<T>(name: string, args: Record<string, unknown>): Promise<Result<T>>;
}
const columns =
  'id,ws_id,slug,title,prompt,difficulty,topic,starter_code,status,revision';
function stored<T>(result: Result<T>): T | null {
  if (result.error) {
    const status =
      result.error.code === '40001' || result.error.code === '23505'
        ? 409
        : result.error.code === 'P0002'
          ? 404
          : result.error.code === '42501'
            ? 403
            : 500;
    // Do not echo database details or case values into RSC/API errors.
    throw new ProgrammingError(
      status === 409
        ? 'Problem revision or slug conflict'
        : 'Problem storage request failed',
      status
    );
  }
  return result.data;
}

/** Create only after app-session workspace/subject/author access succeeds. */
export async function createProgrammingRepository(): Promise<ProgrammingRepository> {
  const client = await createPrivateProgrammingTransport();
  const snapshot: ProgrammingRepository['snapshot'] = async ({
    wsId,
    id,
    author,
  }) =>
    stored(
      await client.rpc<{
        problem: ProgrammingProblemRow;
        cases: ProgrammingCaseRow[];
      }>('read_learn_programming_problem', {
        p_ws_id: wsId,
        p_problem_id: id,
        p_author: author,
      })
    );
  return {
    async list({ wsId, publishedOnly, cursor }) {
      let query = client.from('learn_programming_problems').select(columns);
      query = publishedOnly
        ? query.or(`ws_id.eq.${wsId},ws_id.is.null`).eq('status', 'published')
        : query.or(`ws_id.eq.${wsId},and(ws_id.is.null,status.eq.published)`);
      if (cursor) query = query.gt('id', cursor);
      return (
        stored(
          await query
            .order('id', { ascending: true })
            .limit(PROGRAMMING_CATALOG_PAGE_SIZE + 1)
        ) ?? []
      );
    },
    async find({ wsId, id, publishedOnly }) {
      const result = await snapshot({
        wsId,
        id,
        publishedOnly,
        author: !publishedOnly,
      });
      return result?.problem ?? null;
    },
    snapshot,
    async write({ wsId, actorId, problem, id, expectedRevision }) {
      const row = stored(
        await client.rpc<ProgrammingProblemRow>(
          'save_learn_programming_problem',
          {
            p_ws_id: wsId,
            p_actor_id: actorId,
            p_problem: problem,
            p_problem_id: id ?? null,
            p_expected_revision: expectedRevision ?? null,
          }
        )
      );
      if (!row)
        throw new ProgrammingError('Problem write returned no record', 500);
      return row;
    },
  };
}

/** Internal service-only transport; never import in client components. */
export async function createPrivateProgrammingTransport(): Promise<PrivateProgrammingTransport> {
  const admin = await createAdminClient({ noCookie: true });
  return (
    admin as unknown as { schema(name: string): PrivateProgrammingTransport }
  ).schema('private');
}
