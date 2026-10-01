import 'server-only';
import { importedProgrammingSlug } from '@tuturuuu/education-core/education/programming-imported-catalog';
import { ProgrammingProblemId } from '@tuturuuu/education-core/education/programming-schema';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { notifyDevboxRun } from '@tuturuuu/utils/devbox-control';
import type { CodingChallenge } from './challenges';
import {
  CODING_LANGUAGES,
  type CodingLanguage,
  isCodingLanguage,
} from './languages';
import {
  type CodingExecutionKind,
  type CodingExecutionSummary,
  summarizeJudgeResult,
} from './results';

type StorageError = { message: string } | null;
type QueryResult<T> = Promise<{ data: T[] | null; error: StorageError }>;
type SelectQuery<T> = PromiseLike<{
  data: T[] | null;
  error: StorageError;
}> & {
  contains: (column: string, value: Record<string, unknown>) => SelectQuery<T>;
  eq: (column: string, value: string) => SelectQuery<T>;
  gt: (column: string, value: string) => SelectQuery<T>;
  in: (column: string, values: string[]) => SelectQuery<T>;
  lt: (column: string, value: string) => SelectQuery<T>;
  or: (filters: string) => SelectQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectQuery<T>;
  limit: (count: number) => QueryResult<T>;
};
type PrivateTable<T> = {
  select: (columns: string) => SelectQuery<T>;
};
type PrivateClient = {
  from: <T>(table: string) => PrivateTable<T>;
  rpc: <T>(
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: T | null; error: StorageError }>;
};

type RunnerRow = {
  capabilities: { judge?: { languages?: string[]; ready?: boolean } } | null;
  enabled_features: { judge?: boolean } | null;
  id: string;
  last_heartbeat_at: string | null;
};

type SubmissionRow = {
  challenge_slug: string;
  created_at: string;
  id: string;
  kind?: CodingExecutionKind;
  language?: string | null;
  run_id: string;
  source: string;
};

type RunRow = { id: string; status: string };
type EventRow = {
  event_type: string;
  message: string | null;
  run_id: string;
};

async function privateClient(): Promise<PrivateClient> {
  const admin = await createAdminClient();
  return (
    admin as unknown as { schema: (name: string) => PrivateClient }
  ).schema('private');
}

function assertRows<T>(result: { data: T[] | null; error: StorageError }) {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

async function listReadyJudgeRunners() {
  const client = await privateClient();
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  const result = await client
    .from<RunnerRow>('devbox_runners')
    .select('id,enabled_features,capabilities,last_heartbeat_at')
    .eq('status', 'online')
    .contains('enabled_features', { judge: true })
    .contains('capabilities', { judge: { ready: true } })
    .gt('last_heartbeat_at', cutoff)
    .order('last_heartbeat_at', { ascending: false })
    .limit(50);
  if (
    result.error?.message.includes('enabled_features') &&
    /does not exist|schema cache|could not find/iu.test(result.error.message)
  ) {
    return [];
  }
  const runners = assertRows(result);
  return runners.filter(
    (runner) =>
      runner.enabled_features?.judge === true &&
      runner.capabilities?.judge?.ready === true &&
      !!runner.last_heartbeat_at &&
      new Date(runner.last_heartbeat_at).getTime() > Date.parse(cutoff)
  );
}

export async function listReadyJudgeLanguages(): Promise<CodingLanguage[]> {
  const runners = await listReadyJudgeRunners();
  return CODING_LANGUAGES.filter((language) =>
    runners.some((runner) =>
      runner.capabilities?.judge?.languages?.includes(language)
    )
  );
}

export async function enqueueCodingExecution({
  challenge,
  customCase,
  kind,
  language,
  source,
  userId,
  wsId,
}: {
  challenge: CodingChallenge;
  customCase?: { input: string; expected: string };
  kind: CodingExecutionKind;
  language: CodingLanguage;
  source: string;
  userId: string;
  wsId: string;
}) {
  const client = await privateClient();
  if (
    customCase &&
    (kind !== 'test' ||
      typeof customCase.input !== 'string' ||
      typeof customCase.expected !== 'string' ||
      customCase.input.length > 4096 ||
      customCase.expected.length > 4096)
  ) {
    throw new Error('Invalid custom test case.');
  }
  const cases =
    kind === 'submit'
      ? challenge.cases
      : [
          ...challenge.cases.filter((testCase) => testCase.visible),
          ...(customCase
            ? [
                {
                  input: customCase.input,
                  expected: customCase.expected,
                  visible: true,
                },
              ]
            : []),
        ];
  const command = [
    '__ttr_judge_v1__',
    Buffer.from(
      JSON.stringify({
        cases,
        language,
        source,
      })
    ).toString('base64url'),
  ];
  const { data, error } = await client.rpc<string>(
    'enqueue_learn_coding_execution',
    {
      p_challenge_slug: challenge.slug,
      p_command: command,
      p_kind: kind,
      p_language: language,
      p_source: source,
      p_user_id: userId,
      p_ws_id: wsId,
    }
  );
  if (error || !data)
    throw new Error(error?.message ?? 'Could not queue submission.');
  const submitted = await client
    .from<Pick<SubmissionRow, 'run_id'>>('learn_coding_submissions')
    .select('run_id')
    .eq('id', data)
    .limit(1);
  if (!submitted.error && submitted.data?.[0]?.run_id) {
    await notifyDevboxRun(submitted.data[0].run_id);
  }
  return data;
}

function toExecution(
  submission: SubmissionRow,
  run: RunRow | undefined,
  event: EventRow | undefined
): CodingExecutionSummary {
  return {
    challengeSlug: submission.challenge_slug,
    createdAt: submission.created_at,
    id: submission.id,
    kind: submission.kind === 'test' ? 'test' : 'submit',
    language: isCodingLanguage(submission.language)
      ? submission.language
      : null,
    result: summarizeJudgeResult(event?.message ?? null),
    source: submission.source,
    status: run?.status ?? 'failed',
  };
}

async function hydrateExecutions(
  client: PrivateClient,
  submissions: SubmissionRow[]
) {
  if (!submissions.length) return [];
  const runIds = submissions.map((submission) => submission.run_id);
  const [runResult, eventResult] = await Promise.all([
    client
      .from<RunRow>('devbox_runs')
      .select('id,status')
      .in('id', runIds)
      .limit(runIds.length),
    client
      .from<EventRow>('devbox_run_events')
      .select('run_id,event_type,message')
      .in('run_id', runIds)
      .eq('event_type', 'judge_result')
      .order('created_at', { ascending: true }),
  ]);
  const runs = new Map(assertRows(runResult).map((run) => [run.id, run]));
  const events = new Map(
    assertRows(eventResult).map((event) => [event.run_id, event])
  );
  return submissions.map((submission) =>
    toExecution(
      submission,
      runs.get(submission.run_id),
      events.get(submission.run_id)
    )
  );
}

export async function readCodingSubmission({
  id,
  userId,
  wsId,
  problemId,
}: {
  problemId?: string;
  id: string;
  userId: string;
  wsId: string;
}) {
  const client = await privateClient();
  let query = client
    .from<SubmissionRow>('learn_coding_submissions')
    .select('id,challenge_slug,source,run_id,created_at,kind,language')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('ws_id', wsId);
  if (problemId) query = bindProgrammingHistory(query, problemId);
  const submission = assertRows(await query.limit(1))[0];
  if (!submission) return null;
  return (await hydrateExecutions(client, [submission]))[0] ?? null;
}

export async function listCodingExecutions({
  before,
  challengeSlug,
  userId,
  wsId,
  problemId,
}: {
  problemId?: string;
  before?: string;
  challengeSlug: string;
  userId: string;
  wsId: string;
}) {
  const client = await privateClient();
  let query = client
    .from<SubmissionRow>('learn_coding_submissions')
    .select('id,challenge_slug,source,run_id,created_at,kind,language')
    .eq('user_id', userId)
    .eq('ws_id', wsId);
  query = problemId
    ? bindProgrammingHistory(query, problemId)
    : query.eq('challenge_slug', challengeSlug);
  if (before) {
    const [createdAt, id] = before.split('|');
    if (
      !createdAt ||
      !Number.isFinite(Date.parse(createdAt)) ||
      !/^[0-9T:.+\-Z]+$/u.test(createdAt) ||
      !id ||
      !/^[0-9a-f-]{36}$/iu.test(id)
    ) {
      throw new Error('Invalid history cursor.');
    }
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`
    );
  }
  const rows = assertRows(
    await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(26)
  );
  return {
    items: await hydrateExecutions(client, rows.slice(0, 25)),
    nextCursor:
      rows.length > 25 ? `${rows[24]?.created_at}|${rows[24]?.id}` : null,
  };
}

/** Best-effort wake after a successful version-bound enqueue. The runner polls
 * independently; a notification failure must never encourage duplicate enqueue. */
export async function notifyProgrammingSubmission({
  id,
  problemId,
  wsId,
  userId,
}: {
  id: string;
  problemId: string;
  wsId: string;
  userId: string;
}) {
  try {
    const client = await privateClient();
    const result = await client
      .from<Pick<SubmissionRow, 'run_id'>>('learn_coding_submissions')
      .select('run_id')
      .eq('id', ProgrammingProblemId.parse(id))
      .eq('problem_id', ProgrammingProblemId.parse(problemId))
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .limit(1);
    if (!result.error && result.data?.[0]?.run_id)
      await notifyDevboxRun(result.data[0].run_id);
  } catch {
    // The transaction has already committed and normal runner polling remains active.
  }
}

function bindProgrammingHistory<T>(query: SelectQuery<T>, problemId: string) {
  const id = ProgrammingProblemId.parse(problemId);
  const importedSlug = importedProgrammingSlug(id);
  return importedSlug
    ? query.or(
        `problem_id.eq.${id},and(problem_id.is.null,problem_bound.eq.false,challenge_slug.eq.${importedSlug})`
      )
    : query.eq('problem_id', id);
}
