import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { CodingChallenge } from './challenges';
import { CODING_LANGUAGES, type CodingLanguage } from './languages';

type StorageError = { message: string } | null;
type QueryResult<T> = Promise<{ data: T[] | null; error: StorageError }>;
type SelectQuery<T> = {
  contains: (column: string, value: Record<string, unknown>) => SelectQuery<T>;
  eq: (column: string, value: string) => SelectQuery<T>;
  gt: (column: string, value: string) => SelectQuery<T>;
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
  run_id: string;
  source: string;
};

type RunRow = { status: string };
type EventRow = { event_type: string; message: string | null };

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

export async function enqueueCodingSubmission({
  challenge,
  language,
  source,
  userId,
  wsId,
}: {
  challenge: CodingChallenge;
  language: CodingLanguage;
  source: string;
  userId: string;
  wsId: string;
}) {
  const client = await privateClient();
  const command = [
    '__ttr_judge_v1__',
    Buffer.from(
      JSON.stringify({
        cases: challenge.cases,
        language,
        source,
      })
    ).toString('base64url'),
  ];
  const { data, error } = await client.rpc<string>(
    'enqueue_learn_coding_submission',
    {
      p_challenge_slug: challenge.slug,
      p_command: command,
      p_language: language,
      p_source: source,
      p_user_id: userId,
      p_ws_id: wsId,
    }
  );
  if (error || !data)
    throw new Error(error?.message ?? 'Could not queue submission.');
  return data;
}

export async function readCodingSubmission({
  id,
  userId,
  wsId,
}: {
  id: string;
  userId: string;
  wsId: string;
}) {
  const client = await privateClient();
  const submission = assertRows(
    await client
      .from<SubmissionRow>('learn_coding_submissions')
      .select('id,challenge_slug,source,run_id,created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('ws_id', wsId)
      .limit(1)
  )[0];
  if (!submission) return null;

  const [run, events] = await Promise.all([
    client
      .from<RunRow>('devbox_runs')
      .select('status')
      .eq('id', submission.run_id)
      .limit(1),
    client
      .from<EventRow>('devbox_run_events')
      .select('event_type,message')
      .eq('run_id', submission.run_id)
      .limit(100),
  ]);
  const status = assertRows(run)[0]?.status ?? 'failed';
  const resultEvent = assertRows(events).find(
    (event) => event.event_type === 'judge_result'
  );
  let result: {
    passed: number;
    total: number;
    results: {
      index: number;
      passed: boolean;
      visible: boolean;
      reason: string;
    }[];
  } | null = null;
  if (resultEvent?.message) {
    try {
      const parsed = JSON.parse(resultEvent.message);
      if (typeof parsed.passed === 'number' && Array.isArray(parsed.results)) {
        result = {
          passed: parsed.passed,
          total: parsed.total,
          results: parsed.results.filter(
            (entry: { visible?: boolean }) => entry.visible === true
          ),
        };
      }
    } catch {
      result = null;
    }
  }
  return {
    challengeSlug: submission.challenge_slug,
    createdAt: submission.created_at,
    id: submission.id,
    result,
    source: submission.source,
    status,
  };
}
